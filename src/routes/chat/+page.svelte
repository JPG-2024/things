<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { page } from '$app/state';
	import Input from '@/components/inputs/Input.component.svelte';
	import MarkdownRenderer from '@/components/MarkdownRenderer.svelte';
	import Icon from '@/components/Icon.svelte';
	import { ttsState } from '@/stores/ttsStore.svelte';
	import {
		chatCompletions,
		type LlamaChatCompletionsRequest
	} from '@/lib/utils/chat-completions-provider';

	interface ChatMessage {
		id: string;
		role: 'user' | 'assistant';
		content: string;
		done: boolean;
	}

	const DEFAULT_SYSTEM_PROMPT =
		'You are a concise assistant. Answer clearly and helpfully. no more than 40 words. Use Markdown formatting when appropriate.';

	let messages = $state<ChatMessage[]>([]);
	let streamedText = $state('');
	let streaming = $state(false);
	let error = $state<string | null>(null);
	let activeAssistantId = $state<string | null>(null);
	let messagesContainer = $state<HTMLDivElement | null>(null);

	function generateId(): string {
		return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	}

	async function scrollToBottom() {
		await tick();
		if (messagesContainer) {
			messagesContainer.scrollTop = messagesContainer.scrollHeight;
		}
	}

	async function streamResponse(userPrompt: string) {
		const userMsg: ChatMessage = {
			id: generateId(),
			role: 'user',
			content: userPrompt,
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
		await scrollToBottom();

		const historyForApi: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
			{ role: 'system', content: DEFAULT_SYSTEM_PROMPT }
		];
		for (const m of messages) {
			if (m.id === assistantId) break;
			if (m.role === 'user' || (m.role === 'assistant' && m.done)) {
				historyForApi.push({ role: m.role, content: m.content });
			}
		}

		const request: LlamaChatCompletionsRequest = {
			model: 'llama-server',
			messages: historyForApi,
			temperature: 0.7,
			max_completion_tokens: 1024
		};

		try {
			const response = await chatCompletions(request, {
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
				ttsState.addTextContent(streamedText);
				void ttsState.generateTTS(assistantId);
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Unknown error occurred';
			const idx = messages.findIndex((m) => m.id === assistantId);
			if (idx !== -1) {
				messages[idx] = { ...messages[idx], done: true };
			}
		} finally {
			streaming = false;
			activeAssistantId = null;
			await scrollToBottom();
		}
	}

	function handleEnter(value: string) {
		const trimmed = value.trim();
		if (!trimmed || streaming) return;
		void streamResponse(trimmed);
	}

	onMount(() => {
		const prompt = page.url.searchParams.get('prompt');
		if (prompt?.trim()) {
			void streamResponse(prompt.trim());
		}
	});
</script>

<div class="chat-page">
	<div class="chat-header">
		<a href="/" class="back-link">
			<Icon name="ArrowLeft" size={18} />
			<span>Back</span>
		</a>
		<span class="chat-title">Chat</span>
	</div>

	<div class="messages-container" bind:this={messagesContainer}>
		{#if messages.length === 0 && !streaming}
			<div class="empty-state">
				<p>Start a conversation...</p>
			</div>
		{/if}

		{#each messages as msg (msg.id)}
			<div
				class="message"
				class:user={msg.role === 'user'}
				class:assistant={msg.role === 'assistant'}
			>
				{#if msg.role === 'user'}
					<p class="user-text">{msg.content}</p>
				{:else}
					<div class="assistant-content">
						{#if msg.id === activeAssistantId && streamedText}
							<MarkdownRenderer content={streamedText} />
						{:else if msg.content}
							<MarkdownRenderer content={msg.content} />
						{:else if !msg.done}
							<span class="thinking">Thinking...</span>
						{/if}
					</div>
					{#if msg.done && msg.content.trim()}{/if}
				{/if}
			</div>
		{/each}

		{#if error}
			<div class="error-message">
				<p>Error: {error}</p>
			</div>
		{/if}
	</div>

	<div class="input-bar">
		<Input placeholder="Send a message..." disabled={streaming} onEnter={handleEnter} />
	</div>
</div>

<style>
	.chat-page {
		display: flex;
		flex-direction: column;
		width: 100%;
		height: 100vh;
		overflow: hidden;
	}

	.chat-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
		flex-shrink: 0;
	}

	.back-link {
		all: unset;
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		cursor: pointer;
		color: var(--primary-color);
		font-size: 0.9rem;
	}

	.chat-title {
		font-size: 1.1rem;
		font-weight: 600;
		color: var(--primary-color);
	}

	.messages-container {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		flex: 1;
		overflow-y: auto;
		padding: 1rem;
		scroll-behavior: smooth;
	}

	.empty-state {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: rgba(255, 255, 255, 0.3);
		font-size: 1.1rem;
	}

	.message {
		max-width: 85%;
		padding: 0.75rem 1rem;
		border-radius: 12px;
		line-height: 1.6;
	}

	.message.user {
		align-self: flex-end;
		background: rgba(var(--primary-color-rgb, 120, 100, 255), 0.2);
		border: 1px solid rgba(var(--primary-color-rgb, 120, 100, 255), 0.3);
	}

	.message.assistant {
		align-self: flex-start;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.08);
	}

	.user-text {
		margin: 0;
		white-space: pre-wrap;
		word-wrap: break-word;
	}

	.assistant-content {
		min-height: 1.2rem;
	}

	.thinking {
		color: rgba(255, 255, 255, 0.4);
		font-style: italic;
	}

	.tts-row {
		margin-top: 0.5rem;
		padding-top: 0.5rem;
		border-top: 1px solid rgba(255, 255, 255, 0.06);
	}

	.error-message {
		align-self: center;
		padding: 0.5rem 1rem;
		border-radius: 8px;
		background: rgba(255, 0, 0, 0.1);
		color: #ff5a5a;
		border: 1px solid rgba(255, 0, 0, 0.3);
		font-size: 0.9rem;
	}

	.input-bar {
		flex-shrink: 0;
		padding: 0.75rem 1rem;
		border-top: 1px solid rgba(255, 255, 255, 0.08);
	}
</style>
