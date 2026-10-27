<script lang="ts">
	import { tick } from 'svelte';

	import { fly } from 'svelte/transition';
	import Input from '@/components/inputs/Input.component.svelte';
	import MarkdownRenderer from '@/components/MarkdownRenderer.svelte';
	import Icon from '@/components/Icon.svelte';
	import ToggleIcon from '@/components/ToggleIcon.svelte';
	import SimilarEmbeddingsComponent from '@/components/Tasks/SimilarEmbeddingsComponent.svelte';
	import { ttsState } from '@/stores/ttsStore.svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import { ensureAudioContext } from '@/lib/audioContextManager';
	import {
		chatCompletions,
		type LlamaChatCompletionsRequest
	} from '@/lib/utils/inference/chat-completions-provider';
	import { retrieveContextChunks } from '@/lib/utils/embeddingStore';
	import type { SearchChunkResult } from '@/lib/utils/embeddingStore';
	import ReasoningPanel from '@/components/ReasoningPanel.component.svelte';
	import type { ChatReasoningEffort } from '@/stores/viewStore.svelte';
	import { createReasoningTagSplitter, splitThoughtTags } from '@/lib/utils/reasoningTags';
	import { createHotkey } from '@tanstack/svelte-hotkeys';

	const REASONING_EFFORTS = [
		{ value: 'none', label: 'None' },
		{ value: 'low', label: 'Low' },
		{ value: 'medium', label: 'Medium' },
		{ value: 'high', label: 'High' }
	] as const satisfies ReadonlyArray<{ value: ChatReasoningEffort; label: string }>;

	let { onExit }: { onExit: () => void } = $props();

	interface ChatMessage {
		id: string;
		role: 'user' | 'assistant';
		content: string;
		done: boolean;
		reasoning?: string;
		sources?: SearchChunkResult[];
	}

	let messages = $state<ChatMessage[]>([]);
	let streamedText = $state('');
	let streamedReasoning = $state('');
	let streaming = $state(false);
	let searching = $state(false);
	let error = $state<string | null>(null);
	let activeAssistantId = $state<string | null>(null);
	let messagesContainer = $state<HTMLDivElement | null>(null);
	let abortController = $state<AbortController | null>(null);
	let modalEl = $state<HTMLDivElement | null>(null);

	// Session toggle for embedding retrieval; seeded from the persisted
	// settings choice and written back so the choice sticks across sessions.
	let searchEnabled = $state(viewState.chatSearchEnabled);
	let reasoningMenuOpen = $state(false);

	const searchTables = $derived(
		viewState.chatSearchTables
			.split(',')
			.map((t) => t.trim())
			.filter(Boolean)
	);

	function toggleSearch() {
		searchEnabled = !searchEnabled;
		viewState.chatSearchEnabled = searchEnabled;
	}

	function toggleReasoningMenu() {
		reasoningMenuOpen = !reasoningMenuOpen;
	}

	function selectReasoningEffort(effort: ChatReasoningEffort) {
		viewState.chatReasoningEffort = effort;
		reasoningMenuOpen = false;
	}

	function generateId(): string {
		return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	}

	// Bumped by clear/exit so a retrieval that lands after a reset is
	// discarded instead of pushing orphaned messages.
	let requestEpoch = 0;

	async function scrollToBottom() {
		await tick();
		if (messagesContainer) {
			messagesContainer.scrollTop = messagesContainer.scrollHeight;
		}
	}

	/**
	 * Retrieval hook: searches the configured embedding tables with the user's
	 * message and returns the closest chunks. Best-effort — a failed retrieval
	 * degrades to answering without context, never blocks the chat.
	 */
	async function retrieveSources(query: string): Promise<SearchChunkResult[]> {
		if (!searchEnabled || !viewState.embeddingsServiceUp) return [];
		searching = true;
		try {
			return await retrieveContextChunks({
				tables: searchTables,
				query,
				maxResults: viewState.chatSearchMaxResults,
				maxDistance: viewState.chatSearchMaxDistance,
				excludeArticleUrl: viewState.url ?? undefined
			});
		} catch (err) {
			console.warn('[chat] embedding retrieval failed', err);
			return [];
		} finally {
			searching = false;
		}
	}

	/**
	 * Builds the numbered context block injected ahead of the question so the
	 * model can cite its sources as `[1]`, `[2]`… Only chunks with stored text
	 * are usable as context; the rest still show up in the sources strip.
	 */
	function buildContextBlock(sources: SearchChunkResult[]): string {
		const withText = sources.filter(
			(s) => typeof s.chunkText === 'string' && s.chunkText.trim().length > 0
		);
		if (withText.length === 0) return '';
		return withText
			.map((s, i) => `[${i + 1}] ${s.articleUrl}\n${(s.chunkText as string).trim()}`)
			.join('\n\n');
	}

	async function streamResponse(userPrompt: string) {
		const trimmed = userPrompt.trim();
		if (!trimmed || streaming || searching) return;
		reasoningMenuOpen = false;

		// Retrieval runs before the messages are pushed so the sources are
		// attached to the reply from the start and render while it streams.
		const epoch = requestEpoch;
		const sources = await retrieveSources(trimmed);
		if (epoch !== requestEpoch) return; // cleared or exited while retrieving

		const userMsg: ChatMessage = {
			id: generateId(),
			role: 'user',
			content: trimmed,
			done: true
		};
		messages.push(userMsg);

		const assistantId = generateId();
		const assistantMsg: ChatMessage = {
			id: assistantId,
			role: 'assistant',
			content: '',
			done: false,
			sources
		};
		messages.push(assistantMsg);

		streamedText = '';
		streamedReasoning = '';
		activeAssistantId = assistantId;
		streaming = true;
		error = null;
		abortController = new AbortController();
		void ensureAudioContext();
		await scrollToBottom();

		const historyForApi: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
			{ role: 'system', content: viewState.conversationSystemPrompt }
		];
		for (const m of messages) {
			if (m.id === assistantId) break;
			if (m.role === 'user' || (m.role === 'assistant' && m.done)) {
				historyForApi.push({ role: m.role, content: m.content });
			}
		}

		// Numbered retrieved context is prepended to the last user message so
		// the model can cite `[n]` sources; the question itself stays last.
		const contextBlock = buildContextBlock(sources);
		if (contextBlock) {
			const lastIdx = historyForApi.length - 1;
			if (lastIdx >= 0 && historyForApi[lastIdx].role === 'user') {
				historyForApi[lastIdx].content =
					`Relevant context retrieved from the user's library (use it when relevant, cite as [1], [2]…; ignore it if it does not help):\n${contextBlock}\n\nQuestion:\n${historyForApi[lastIdx].content}`;
			}
		}

		const request: LlamaChatCompletionsRequest = {
			model: 'llama-server',
			messages: historyForApi,
			temperature: viewState.conversationTemperature,
			max_completion_tokens: viewState.conversationMaxTokens,
			top_p: viewState.conversationTopP,
			frequency_penalty: viewState.conversationFrequencyPenalty,
			presence_penalty: viewState.conversationPresencePenalty,
			reasoning_effort: viewState.chatReasoningEffort
		};

		// Reasoning can arrive as `reasoning_content` deltas or as inline thought
		// tags in `content`; the splitter routes the tags away from the answer.
		const tagSplitter = createReasoningTagSplitter();
		let sawReasoningContent = false;

		try {
			const response = await chatCompletions(request, {
				signal: abortController.signal,
				onToken: (token) => {
					const parts = tagSplitter.feed(token);
					if (parts.reasoning) streamedReasoning += parts.reasoning;
					if (parts.content) streamedText += parts.content;
					void scrollToBottom();
				},
				onReasoningToken: (token) => {
					sawReasoningContent = true;
					streamedReasoning += token;
					void scrollToBottom();
				}
			});

			const finalText = response.choices?.[0]?.message?.content;
			let finalReasoning = '';
			if (typeof finalText === 'string' && finalText) {
				const parts = splitThoughtTags(finalText);
				if (parts.content.trim()) {
					streamedText = parts.content;
				}
				if (parts.reasoning && !sawReasoningContent) {
					streamedReasoning += parts.reasoning;
					finalReasoning = parts.reasoning;
				}
			}

			const idx = messages.findIndex((m) => m.id === assistantId);
			if (idx !== -1) {
				messages[idx] = {
					...messages[idx],
					content: streamedText,
					reasoning: streamedReasoning || finalReasoning,
					done: true
				};
				if (viewState.autoSpeechEnabled && streamedText.trim()) {
					void ensureAudioContext();
					void ttsState.generateFromClipboard(streamedText);
				}
			}
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') {
				const idx = messages.findIndex((m) => m.id === assistantId);
				if (idx !== -1) {
					messages[idx] = {
						...messages[idx],
						content: streamedText,
						reasoning: streamedReasoning,
						done: true
					};
				}
				return;
			}
			error = err instanceof Error ? err.message : 'Unknown error occurred';
			const idx = messages.findIndex((m) => m.id === assistantId);
			if (idx !== -1) {
				messages[idx] = { ...messages[idx], done: true };
			}
		} finally {
			streaming = false;
			activeAssistantId = null;
			abortController = null;
			await scrollToBottom();
		}
	}

	function handleEnter(value: string) {
		const trimmed = value.trim();
		if (!trimmed || streaming) return;
		void streamResponse(trimmed);
	}

	function handleClear() {
		if (abortController) {
			abortController.abort();
			abortController = null;
		}
		requestEpoch++;
		messages = [];
		streamedText = '';
		streamedReasoning = '';
		streaming = false;
		searching = false;
		reasoningMenuOpen = false;
		activeAssistantId = null;
		error = null;
	}

	function handleExit() {
		if (abortController) {
			abortController.abort();
			abortController = null;
		}
		requestEpoch++;
		// clear on exit per spec
		messages = [];
		streamedText = '';
		streamedReasoning = '';
		streaming = false;
		searching = false;
		reasoningMenuOpen = false;
		activeAssistantId = null;
		error = null;
		onExit();
	}

	function handleStop() {
		if (abortController) {
			abortController.abort();
		}
	}

	createHotkey('Escape', handleExit, () => ({
		enabled: true,
		ignoreInputs: false,
		preventDefault: true,
		stopPropagation: true
	}));

	$effect(() => {
		return () => {
			if (abortController) {
				abortController.abort();
			}
		};
	});

	$effect(() => {
		// auto-focus input when modal mounts (chatOpen -> true)
		// modalEl is bound, so effect runs after mount
		if (modalEl) {
			const el = modalEl;
			void tick().then(() => {
				const input = el.querySelector<HTMLInputElement>('input.text-input');
				input?.focus();
			});
		}
	});
</script>

<div
	bind:this={modalEl}
	in:fly={{ x: -10, duration: 40 }}
	out:fly={{ x: -30, duration: 100 }}
	class="chat-modal"
	role="dialog"
	aria-modal="true"
	aria-label="Chat"
>
	<div class="chat-modal__header">
		<span class="chat-modal__title">Chat</span>
		<div class="chat-modal__actions">
			<ToggleIcon
				name="FileDigit"
				checked={searchEnabled}
				size={18}
				tooltipProps={{ content: 'search context in embeddings' }}
				onClick={toggleSearch}
			/>
			<div class="chat-modal__reasoning-wrap">
				<button
					type="button"
					class="chat-modal__reasoning-btn"
					class:chat-modal__reasoning-btn--active={viewState.chatReasoningEffort !== 'none'}
					onclick={toggleReasoningMenu}
					aria-label="Reasoning effort"
					title="reasoning effort sent as-is to the provider"
					aria-expanded={reasoningMenuOpen}
				>
					<Icon name="Brain" size={18} color={viewState.primaryColor} />
				</button>
				{#if reasoningMenuOpen}
					<button
						type="button"
						class="chat-modal__menu-backdrop"
						onclick={() => (reasoningMenuOpen = false)}
						aria-label="Close reasoning menu"
					></button>
					<div class="chat-modal__reasoning-menu" role="menu">
						{#each REASONING_EFFORTS as effort (effort.value)}
							<button
								type="button"
								class="chat-modal__reasoning-item"
								class:chat-modal__reasoning-item--selected={viewState.chatReasoningEffort ===
									effort.value}
								role="menuitemradio"
								aria-checked={viewState.chatReasoningEffort === effort.value}
								onclick={() => selectReasoningEffort(effort.value)}
							>
								<Icon
									name="Dot"
									size={14}
									color={viewState.chatReasoningEffort === effort.value
										? 'var(--primary-color)'
										: 'transparent'}
								/>
								{effort.label}
							</button>
						{/each}
					</div>
				{/if}
			</div>
			{#if messages.length > 0}
				<button
					type="button"
					class="chat-modal__clear-btn"
					onclick={handleClear}
					aria-label="Clear chat"
				>
					<Icon name="Trash2" size={18} color={viewState.primaryColor} />
				</button>
			{/if}
			<button
				type="button"
				class="chat-modal__exit-btn"
				onclick={handleExit}
				aria-label="Close chat"
			>
				<Icon name="X" size={18} color={viewState.primaryColor} />
			</button>
		</div>
	</div>

	<div class="chat-modal__messages" bind:this={messagesContainer}>
		{#if messages.length === 0 && !streaming}
			<div class="chat-modal__empty">
				<p>Start a conversation...</p>
				<span class="chat-modal__hint">Press Enter to send · Esc to close</span>
			</div>
		{/if}

		{#each messages as msg (msg.id)}
			<div
				class="chat-modal__message"
				class:chat-modal__message--user={msg.role === 'user'}
				class:chat-modal__message--assistant={msg.role === 'assistant'}
			>
				{#if msg.role === 'user'}
					<p class="chat-modal__user-text">{msg.content}</p>
				{:else if msg.id === activeAssistantId}
					<div class="chat-modal__assistant-content">
						{#if streamedReasoning}
							<ReasoningPanel reasoning={streamedReasoning} {streaming} />
						{/if}
						{#if streamedText}
							<MarkdownRenderer content={streamedText} />
						{:else if !streamedReasoning}
							<span class="chat-modal__thinking">Thinking...</span>
						{/if}
					</div>
				{:else}
					<div class="chat-modal__assistant-content">
						{#if msg.reasoning}
							<ReasoningPanel reasoning={msg.reasoning} />
						{/if}
						{#if msg.content}
							<MarkdownRenderer content={msg.content} />
						{:else if msg.reasoning}
							<span class="chat-modal__no-answer">No final response from the model</span>
						{/if}
					</div>
				{/if}
			</div>

			{#if msg.role === 'assistant' && msg.sources && msg.sources.length > 0}
				<SimilarEmbeddingsComponent
					id="analysis"
					results={msg.sources}
					label="Sources"
					enabled={false}
					articleUrl={null}
				/>
			{/if}
		{/each}

		{#if error}
			<div class="chat-modal__error">
				<p>Error: {error}</p>
				<button type="button" onclick={() => (error = null)}>×</button>
			</div>
		{/if}
	</div>

	<div class="chat-modal__input-bar">
		{#if searching}
			<span class="chat-modal__searching">Searching sources…</span>
		{/if}
		<div class="chat-modal__input-wrap">
			<Input
				autofocus
				placeholder="Send a message..."
				disabled={streaming || searching}
				onEnter={handleEnter}
			/>
		</div>
		{#if streaming}
			<button
				type="button"
				class="chat-modal__stop-btn"
				onclick={handleStop}
				aria-label="Stop generation"
			>
				<Icon name="Square" size={16} color={viewState.primaryColor} />
				<span>Stop</span>
			</button>
		{/if}
	</div>
</div>

<style>
	.chat-modal {
		--chat-gap: 0rem;
		display: flex;
		flex-direction: column;
		position: fixed;
		top: var(--chat-gap);
		bottom: var(--chat-gap);
		left: var(--chat-gap);
		right: auto;
		width: calc(70vw - var(--chat-gap) * 2);
		overflow: hidden;
		font-family: var(--font-secondary);
		background: rgba(14, 14, 14, 0.95);
		border: 3px solid rgba(255, 255, 255, 0.1);
		/* border-radius: var(--radius-sm); */
		box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
		z-index: 1100;
	}

	.chat-modal__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.5rem;

		flex-shrink: 0;
	}

	.chat-modal__title {
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--primary-color);
	}

	.chat-modal__actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.chat-modal__clear-btn,
	.chat-modal__exit-btn {
		all: unset;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border-radius: 50%;
		cursor: pointer;
		opacity: 0.7;
		transition: opacity 0.2s;
	}

	.chat-modal__clear-btn:hover,
	.chat-modal__exit-btn:hover {
		opacity: 1;
	}

	.chat-modal__reasoning-wrap {
		position: relative;
		display: inline-flex;
	}

	.chat-modal__reasoning-btn {
		all: unset;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border-radius: 50%;
		cursor: pointer;
		opacity: 0.7;
		transition: opacity 0.2s;
	}

	.chat-modal__reasoning-btn:hover {
		opacity: 1;
	}

	.chat-modal__reasoning-btn--active,
	.chat-modal__reasoning-btn--active:hover {
		opacity: 1;
		filter: var(--glow-filter);
	}

	.chat-modal__menu-backdrop {
		all: unset;
		position: fixed;
		inset: 0;
		z-index: 1;
		cursor: default;
	}

	.chat-modal__reasoning-menu {
		position: absolute;
		top: calc(100% + 0.25rem);
		right: 0;
		z-index: 2;
		display: flex;
		flex-direction: column;
		min-width: 8rem;
		padding: 0.3rem;
		border-radius: var(--radius-md);
		border: 1px solid rgba(255, 255, 255, 0.12);
		background: rgba(14, 14, 14, 0.98);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
	}

	.chat-modal__reasoning-item {
		all: unset;
		display: flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.35rem 0.5rem;
		border-radius: var(--radius-sm);
		font-size: 0.8rem;
		color: rgba(255, 255, 255, 0.7);
		cursor: pointer;
		white-space: nowrap;
	}

	.chat-modal__reasoning-item:hover {
		background: rgba(255, 255, 255, 0.06);
		color: white;
	}

	.chat-modal__reasoning-item--selected {
		color: var(--primary-color);
	}

	.chat-modal__no-answer {
		font-size: 0.75rem;
		font-style: italic;
		color: rgba(255, 255, 255, 0.3);
	}

	.chat-modal__messages {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		flex: 1;
		overflow-y: auto;
		padding: 1.25rem 1.5rem;
		scroll-behavior: smooth;
	}

	.chat-modal__empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: rgba(255, 255, 255, 0.25);
		font-size: 1.05rem;
		gap: 0.5rem;
	}

	.chat-modal__hint {
		font-size: 0.78rem;
		opacity: 0.5;
	}

	.chat-modal__message {
		max-width: 85%;
		padding: 0.75rem 1rem;
		font-size: 0.8rem;
		line-height: 1.6;
		color: var(--bg-color);
	}

	.chat-modal__message--user {
		align-self: flex-end;
	}

	.chat-modal__message--assistant {
		align-self: flex-start;
	}

	.chat-modal__user-text {
		margin: 0;
		white-space: pre-wrap;
		word-wrap: break-word;
	}

	.chat-modal__assistant-content {
		min-height: 1.2rem;
	}

	.chat-modal__thinking {
		color: rgba(255, 255, 255, 0.4);
		font-style: italic;
	}

	.chat-modal__error {
		align-self: center;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 1rem;
		border-radius: var(--radius-md);
		background: rgba(255, 0, 0, 0.1);
		color: #ff5a5a;
		border: 1px solid rgba(255, 0, 0, 0.3);
		font-size: 0.9rem;
	}

	.chat-modal__error button {
		all: unset;
		cursor: pointer;
		font-size: 1.2rem;
		line-height: 1;
		opacity: 0.7;
	}

	.chat-modal__error button:hover {
		opacity: 1;
	}

	.chat-modal__input-bar {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-shrink: 0;
		padding: 0.9rem 1.5rem;
		border-top: 1px solid rgba(255, 255, 255, 0.08);
		background: rgba(0, 0, 0, 0.2);
	}

	.chat-modal__input-wrap {
		flex: 1;
	}

	.chat-modal__searching {
		font-size: 0.75rem;
		font-style: italic;
		color: rgba(255, 255, 255, 0.4);
		white-space: nowrap;
	}

	/* Sources strip reuses SimilarEmbeddingsComponent: align it like the
	 * assistant bubbles and let the thumbnails size the row. */
	.chat-modal__messages :global(.similar-embeddings) {
		align-self: flex-start;
		max-width: 85%;
	}

	.chat-modal__stop-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.45rem 0.9rem;
		border-radius: var(--radius-md);
		border: 1px solid rgba(255, 80, 80, 0.35);
		background: rgba(255, 80, 80, 0.1);
		color: #ff5a5a;
		font-size: 0.85rem;
		cursor: pointer;
		white-space: nowrap;
	}

	.chat-modal__stop-btn:hover {
		background: rgba(255, 80, 80, 0.18);
	}
</style>
