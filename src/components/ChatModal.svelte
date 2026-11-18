<script lang="ts">
	import { tick } from 'svelte';
	import { page } from '$app/state';
	import Textarea from '@/components/inputs/Textarea.component.svelte';
	import Button from '@/components/inputs/Button.component.svelte';
	import MarkdownRenderer from '@/components/MarkdownRenderer.svelte';
	import Icon from '@/components/Icon.svelte';
	import Modal from '@/components/Modal.svelte';
	import ToggleIcon from '@/components/ToggleIcon.svelte';
	import SimilarEmbeddingsComponent from '@/components/Tasks/SimilarEmbeddingsComponent.svelte';
	import { ttsState } from '@/stores/ttsStore.svelte';
	import { viewState, resolveConversationSystemPrompt } from '@/stores/viewStore.svelte';
	import { ensureAudioContext } from '@/lib/audioContextManager';
	import {
		chatCompletions,
		type LlamaChatCompletionsRequest
	} from '@/lib/utils/inference/chat-completions-provider';
	import { retrieveContextChunks } from '@/lib/utils/embeddingStore';
	import type { SearchChunkResult } from '@/lib/utils/embeddingStore';
	import { resolveChatScope, type ChatScope } from '@/lib/utils/chatScope';
	import { answerWindows, type QuestionMessage } from '@/lib/utils/questionWindows';
	import { readRawContent } from '@/lib/utils/rawContent';
	import ReasoningPanel from '@/components/ReasoningPanel.component.svelte';
	import ConversationSettingsModal from '@/components/modals/ConversationSettingsModal.svelte';
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
		/** Scope label when a scoped retrieval came back empty, for the hint. */
		scopeMiss?: string;
	}

	let userPrompt = $state<string>('');
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

	// Full-text ("this article") scope: the raw body is cached per url for the
	// modal session and the divisor that last fit is remembered across turns,
	// so a turn never re-sends a context known not to fit.
	let fullTextCache: { url: string; content: string } | null = null;
	let fullTextDivisor: { url: string; divisor: number } | null = null;
	let windowStatus = $state<string | null>(null);

	// Session toggle for embedding retrieval; seeded from the persisted
	// settings choice and written back so the choice sticks across sessions.
	let searchEnabled = $state(viewState.chatSearchEnabled);
	let reasoningMenuOpen = $state(false);
	let settingsOpen = $state(false);

	// The panel lives in the root layout, so it has no page props: the scope is
	// derived from the current route (article, profile, category or library).
	const scope = $derived(resolveChatScope(page.route.id, page.params));

	/** Active hard filter, or `null` when the whole library is searched. */
	const activeScope = $derived(
		viewState.chatSearchScope === 'view' && scope.kind !== 'library' ? scope : null
	);

	// Retrieval tables follow Settings → Chat context (`summary` by default).
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

	function toggleScope() {
		viewState.chatSearchScope = viewState.chatSearchScope === 'view' ? 'library' : 'view';
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
	 * message and returns the closest chunks. A non-null `scope` is a hard
	 * filter inside LanceDB, so a scoped retrieval never leaks chunks from
	 * another article or profile. Best-effort — a failed retrieval degrades to
	 * answering without context, never blocks the chat.
	 */
	async function retrieveSources(
		query: string,
		scopeFilter: ChatScope | null
	): Promise<SearchChunkResult[]> {
		if (!searchEnabled || !viewState.embeddingsServiceUp) return [];
		searching = true;
		try {
			return await retrieveContextChunks({
				tables: searchTables,
				query,
				articleUrl: scopeFilter?.articleUrl,
				profileId: scopeFilter?.profileId,
				category: scopeFilter?.category,
				maxResults: viewState.chatSearchMaxResults,
				maxDistance: viewState.chatSearchMaxDistance
			});
		} catch (err) {
			console.warn('[chat] embedding retrieval failed', err);
			return [];
		} finally {
			searching = false;
		}
	}

	/**
	 * Raw body of the scoped article, cached for the modal session: follow-up
	 * questions re-use it instead of re-reading the file. Returns `null` when
	 * the article has no stored body.
	 */
	async function loadFullText(url: string): Promise<string | null> {
		if (fullTextCache?.url === url) return fullTextCache.content;
		const content = await readRawContent(url);
		const body = content?.trim();
		if (!body) return null;
		fullTextCache = { url, content: body };
		return body;
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
		// The scope is captured once so the hint matches the filter that ran,
		// even if the route changes while the answer streams.
		const epoch = requestEpoch;
		// Full-text scope: when the search is narrowed to "this article" the
		// raw body replaces chunk retrieval — reading it needs no embeddings
		// service. Any other scope keeps the chunk path (which no-ops while
		// the service is down). An article without a stored body degrades to
		// chunks like any other scope.
		const scopeFilter =
			searchEnabled && (viewState.embeddingsServiceUp || activeScope?.kind === 'article')
				? activeScope
				: null;
		const fullTextUrl = scopeFilter?.kind === 'article' ? scopeFilter.articleUrl : undefined;
		const fullText = fullTextUrl ? { url: fullTextUrl } : null;
		let sources: SearchChunkResult[] = [];
		let rawBody: string | null = null;

		if (fullText) {
			rawBody = await loadFullText(fullText.url);
			if (rawBody === null) {
				sources = await retrieveSources(trimmed, scopeFilter);
			}
		} else {
			sources = await retrieveSources(trimmed, scopeFilter);
		}

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
			sources,
			scopeMiss:
				scopeFilter && !rawBody && sources.length === 0
					? (scopeFilter.label ?? undefined)
					: undefined
		};
		messages.push(assistantMsg);

		streamedText = '';
		streamedReasoning = '';
		windowStatus = null;
		activeAssistantId = assistantId;
		streaming = true;
		error = null;
		abortController = new AbortController();
		void ensureAudioContext();
		await scrollToBottom();

		// Prior turns for the window path (`answerWindows` takes the current
		// question separately): done messages only, before this turn's bubble.
		const priorHistory: QuestionMessage[] = [];
		for (const m of messages) {
			if (m.id === assistantId || m.id === userMsg.id) continue;
			if (m.role === 'user' || (m.role === 'assistant' && m.done)) {
				priorHistory.push({ role: m.role, content: m.content });
			}
		}

		const historyForApi: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
			{
				role: 'system',
				content: resolveConversationSystemPrompt(viewState.conversationSystemPrompt)
			}
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
			if (fullText && rawBody) {
				// Window QA path: the raw body answers the question directly, or
				// climbs the divisor ladder when it does not fit the context.
				const result = await answerWindows(rawBody, trimmed, {
					startDivisor: fullTextDivisor?.url === fullText.url ? fullTextDivisor.divisor : undefined,
					systemPrompt: resolveConversationSystemPrompt(viewState.conversationSystemPrompt),
					history: priorHistory,
					signal: abortController.signal,
					onAttempt: (total) => (windowStatus = `reading part 1/${total}`),
					onWindow: (index, total) => {
						windowStatus =
							index + 1 < total ? `reading part ${index + 2}/${total}` : 'merging partial answers…';
					},
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
				// Remember the divisor that fit so the next turn starts there.
				fullTextDivisor = { url: fullText.url, divisor: result.divisor };

				// The streamed text is the merge call's answer; the returned one
				// covers a server that answered without streaming.
				if (!streamedText.trim()) streamedText = result.answer;

				const idx = messages.findIndex((m) => m.id === assistantId);
				if (idx !== -1) {
					messages[idx] = {
						...messages[idx],
						content: streamedText,
						reasoning: streamedReasoning,
						done: true
					};
					if (viewState.autoSpeechEnabled && streamedText.trim()) {
						void ensureAudioContext();
						void ttsState.generateFromClipboard(streamedText);
					}
				}
			} else {
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
			windowStatus = null;
			activeAssistantId = null;
			abortController = null;
			await scrollToBottom();
		}
	}

	function handleSendPrompt() {
		const trimmed = userPrompt.trim();
		if (!trimmed || streaming || searching) return;
		userPrompt = '';
		void streamResponse(trimmed);
	}

	function handleClear() {
		if (abortController) {
			abortController.abort();
			abortController = null;
		}
		requestEpoch++;
		messages = [];
		fullTextCache = null;
		fullTextDivisor = null;
		windowStatus = null;
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
		fullTextCache = null;
		fullTextDivisor = null;
		windowStatus = null;
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

	/**
	 * Esc closes the settings editor first; only a second Esc exits the chat.
	 * The hotkey manager fires every matching registration on one keypress, so
	 * the chat handler must be disabled while the editor owns the key.
	 */
	createHotkey('Escape', handleExit, () => ({
		enabled: !settingsOpen,
		ignoreInputs: false,
		preventDefault: true,
		stopPropagation: true
	}));

	// Shift+Enter sends from the textarea; plain Enter keeps inserting a newline.
	createHotkey('Shift+Enter', handleSendPrompt, () => ({
		enabled: !settingsOpen && !streaming && !searching,
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
				const input = el.querySelector<HTMLTextAreaElement>('textarea.text-input');
				input?.focus();
			});
		}
	});

	// Launcher-initiated prompts (e.g. the takeaways icon): consumed and cleared
	// here, watching the store rather than only mount so it also lands while the
	// chat is already open. A launched prompt always reads the current article,
	// so the session toggles are forced to search + "this article" scope.
	$effect(() => {
		const prompt = viewState.pendingChatPrompt;
		if (!prompt) return;
		viewState.pendingChatPrompt = null;
		searchEnabled = true;
		viewState.chatSearchScope = 'view';
		if (streaming || searching) return;
		void streamResponse(prompt);
	});
</script>

<!-- Chat as a centered dialog: Modal owns the dimmed backdrop, the fade/scale
     transition, click-outside and focus containment; the chat only fills it. -->
<Modal
	show
	fullHeight
	onClose={handleExit}
	showClose={false}
	closeOnEscape={false}
	ariaLabel="Chat"
>
	<div bind:this={modalEl} class="chat-modal">
		<div class="chat-modal__header">
			<span class="chat-modal__title">Chat</span>
			<div class="chat-modal__actions">
				{#if searchEnabled && scope.kind !== 'library'}
					<button
						type="button"
						class="chat-modal__scope"
						class:chat-modal__scope--library={viewState.chatSearchScope === 'library'}
						onclick={toggleScope}
						aria-pressed={viewState.chatSearchScope === 'view'}
						title={viewState.chatSearchScope === 'view'
							? `Retrieving only from ${scope.label} — click to search the whole library`
							: `Retrieving from the whole library — click to search only ${scope.label}`}
					>
						{viewState.chatSearchScope === 'view' ? scope.label : 'library'}
					</button>
				{/if}
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
				<button
					type="button"
					class="chat-modal__settings-btn"
					onclick={() => {
						reasoningMenuOpen = false;
						settingsOpen = true;
					}}
					aria-label="Edit assistant style"
					title="edit assistant style"
				>
					<Icon name="ScrollText" size={18} color={viewState.primaryColor} />
				</button>
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
					<span class="chat-modal__hint">Shift+Enter to send · Esc to close</span>
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
							{:else if windowStatus}
								<span class="chat-modal__thinking">{windowStatus}</span>
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
				{:else if msg.role === 'assistant' && msg.scopeMiss}
					<p class="chat-modal__scope-miss">No indexed chunks in {msg.scopeMiss}.</p>
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
				<Textarea
					bind:value={userPrompt}
					autofocus
					placeholder="Send a message..."
					disabled={streaming || searching}
				/>
				<Button onClick={handleSendPrompt}>send</Button>
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
</Modal>

<!-- Outside the chat dialog: the Modal shell animates with a scale transform,
	 which would turn this fixed backdrop into a relative one. -->
<ConversationSettingsModal show={settingsOpen} onClose={() => (settingsOpen = false)} />

<style>
	.chat-modal {
		display: flex;
		flex-direction: column;
		width: 100%;
		flex: 1;
		min-height: 0;
		overflow: hidden;
		font-family: var(--font-secondary);
		background: rgba(14, 14, 14, 0.95);
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
		justify-content: flex-end;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	/* Retrieval scope: `this article` / `this profile` / `this category` when
	   the search is narrowed, `library` when the chip was clicked off. */
	.chat-modal__scope {
		all: unset;
		cursor: pointer;
		padding: 0.2rem 0.55rem;
		border-radius: var(--radius-lg);
		border: 1px solid color-mix(in srgb, var(--primary-color) 45%, transparent);
		color: var(--primary-color);
		font-size: 0.68rem;
		line-height: 1.2;
		white-space: nowrap;
		opacity: 0.9;
		transition: opacity 2s;
	}

	.chat-modal__scope:hover {
		opacity: 1;
	}

	.chat-modal__scope--library {
		border-color: var(--gray-300);
		color: rgba(255, 255, 255, 0.5);
	}

	.chat-modal__clear-btn,
	.chat-modal__exit-btn,
	.chat-modal__settings-btn {
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
	.chat-modal__exit-btn:hover,
	.chat-modal__settings-btn:hover {
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
		transition: opacity 2s;
	}

	.chat-modal__reasoning-btn:hover {
		opacity: 1;
	}

	.chat-modal__reasoning-btn--active {
		opacity: 1;
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
		min-height: 0;
		padding: 1.25rem 1.5rem;
		scroll-behavior: smooth;
		overflow-y: scroll;
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
		background: rgba(0, 0, 0, 0.2);
	}

	.chat-modal__input-wrap {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.chat-modal__input-wrap :global(.text-input) {
		flex: 1;
		min-width: 0;
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

	.chat-modal__scope-miss {
		align-self: flex-start;
		margin: 0;
		max-width: 85%;
		font-size: 0.72rem;
		font-style: italic;
		color: rgba(255, 255, 255, 0.35);
	}

	.chat-modal__stop-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.45rem 0.9rem;

		background: transparent;
		font-size: 0.85rem;
		cursor: pointer;
		white-space: nowrap;
	}

	.chat-modal__stop-btn:hover {
		background: rgba(255, 80, 80, 0.18);
	}
</style>
