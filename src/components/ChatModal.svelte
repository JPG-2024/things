<script lang="ts">
	import { tick } from 'svelte';
	import { fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import Input from '@/components/inputs/Input.component.svelte';
	import MarkdownRenderer from '@/components/MarkdownRenderer.svelte';
	import Icon from '@/components/Icon.svelte';
	import { ttsState } from '@/stores/ttsStore.svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import { ensureAudioContext } from '@/lib/audioContextManager';
	import {
		chatCompletions,
		type LlamaChatCompletionsRequest
	} from '@/lib/utils/inference/chat-completions-provider';
	import { createHotkey } from '@tanstack/svelte-hotkeys';

	let { onExit }: { onExit: () => void } = $props();

	interface ChatMessage {
		id: string;
		role: 'user' | 'assistant';
		content: string;
		done: boolean;
	}

	let messages = $state<ChatMessage[]>([]);
	let streamedText = $state('');
	let streaming = $state(false);
	let error = $state<string | null>(null);
	let activeAssistantId = $state<string | null>(null);
	let messagesContainer = $state<HTMLDivElement | null>(null);
	let abortController = $state<AbortController | null>(null);
	let modalEl = $state<HTMLDivElement | null>(null);

	function generateId(): string {
		return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	}

	async function scrollToBottom() {
		await tick();
		if (messagesContainer) {
			messagesContainer.scrollTop = messagesContainer.scrollHeight;
		}
	}

	/**
	 * Hook placeholder for future embedding search.
	 * Allows augmentation of the prompt with retrieved context.
	 * Currently just logs; future impl can call findSimilarChunks etc.
	 */
	async function getEmbeddingContext(userInput: string): Promise<string | null> {
		console.log('[chat] embedding hook — userInput:', userInput, 'history len:', messages.length);
		// Example future:
		// const results = await findSimilarChunks({ table: 'topics', queryChunks: [userInput], limit: 5 });
		// return results.map(r=>r.chunkText).join('\n\n');
		return null;
	}

	async function streamResponse(userPrompt: string) {
		const trimmed = userPrompt.trim();
		if (!trimmed || streaming) return;

		// Hook: allow future embedding/context injection
		const embeddingContext = await getEmbeddingContext(trimmed);

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
			done: false
		};
		messages.push(assistantMsg);

		streamedText = '';
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

		// If embedding hook returned context, augment last user message
		if (embeddingContext) {
			const lastIdx = historyForApi.length - 1;
			if (lastIdx >= 0 && historyForApi[lastIdx].role === 'user') {
				historyForApi[lastIdx].content =
					`Relevant context:\n${embeddingContext}\n\nQuestion:\n${historyForApi[lastIdx].content}`;
			}
		}

		const request: LlamaChatCompletionsRequest = {
			model: 'llama-server',
			messages: historyForApi,
			temperature: viewState.conversationTemperature,
			max_completion_tokens: viewState.conversationMaxTokens,
			top_p: viewState.conversationTopP,
			frequency_penalty: viewState.conversationFrequencyPenalty,
			presence_penalty: viewState.conversationPresencePenalty
		};

		try {
			const response = await chatCompletions(request, {
				signal: abortController.signal,
				onToken: (token) => {
					streamedText += token;
					void scrollToBottom();
				}
			});

			const finalText = response.choices?.[0]?.message?.content;
			if (typeof finalText === 'string' && finalText.trim()) {
				streamedText = finalText;
			}

			const idx = messages.findIndex((m) => m.id === assistantId);
			if (idx !== -1) {
				messages[idx] = { ...messages[idx], content: streamedText, done: true };
				if (viewState.autoSpeechEnabled && streamedText.trim()) {
					viewState.ttsPlayerMode = 'mini';
					void ensureAudioContext();
					void ttsState.generateFromClipboard(streamedText);
				}
			}
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') {
				const idx = messages.findIndex((m) => m.id === assistantId);
				if (idx !== -1) {
					messages[idx] = { ...messages[idx], content: streamedText, done: true };
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
		messages = [];
		streamedText = '';
		streaming = false;
		activeAssistantId = null;
		error = null;
	}

	function handleExit() {
		if (abortController) {
			abortController.abort();
			abortController = null;
		}
		// clear on exit per spec
		messages = [];
		streamedText = '';
		streaming = false;
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
	in:fade={{ duration: 100, easing: cubicOut }}
	out:fade={{ duration: 200 }}
	class="chat-modal"
	role="dialog"
	aria-modal="true"
	aria-label="Chat"
>
	<div class="chat-modal__header">
		<span class="chat-modal__title">Chat</span>
		<div class="chat-modal__actions">
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
				<Icon name="X" size={22} color={viewState.primaryColor} />
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
				{:else}
					<div class="chat-modal__assistant-content">
						{#if msg.id === activeAssistantId && streamedText}
							<MarkdownRenderer content={streamedText} />
						{:else if msg.content}
							<MarkdownRenderer content={msg.content} />
						{:else if !msg.done}
							<span class="chat-modal__thinking">Thinking...</span>
						{/if}
					</div>
				{/if}
			</div>
		{/each}

		{#if error}
			<div class="chat-modal__error">
				<p>Error: {error}</p>
				<button type="button" onclick={() => (error = null)}>×</button>
			</div>
		{/if}
	</div>

	<div class="chat-modal__input-bar">
		<div class="chat-modal__input-wrap">
			<Input autofocus placeholder="Send a message..." disabled={streaming} onEnter={handleEnter} />
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
		display: flex;
		flex-direction: column;
		position: fixed;
		inset: 0;
		overflow: hidden;
		background: rgba(14, 14, 14, 0.95);
		z-index: 1100;
		font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
	}

	.chat-modal__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.5rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
		flex-shrink: 0;
	}

	.chat-modal__title {
		font-size: 1.1rem;
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
		border-radius: var(--radius-lg);
		line-height: 1.6;
	}

	.chat-modal__message--user {
		align-self: flex-end;
		background: rgba(var(--primary-color-rgb, 120, 100, 255), 0.2);
		border: 1px solid rgba(var(--primary-color-rgb, 120, 100, 255), 0.3);
	}

	.chat-modal__message--assistant {
		align-self: flex-start;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.08);
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
