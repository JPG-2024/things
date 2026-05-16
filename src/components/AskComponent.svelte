<script lang="ts">
	import Input from '@/components/inputs/Input.component.svelte';
	import MarkdownRenderer from '@/components/MarkdownRenderer.svelte';
	import { chatCompletions, type LlamaChatCompletionsRequest } from '@/lib/utils/llama-completions';
	import type { Task, TaskComponentProps } from '@/types/taskRunner.types';

	type AskComponentProps = TaskComponentProps & {
		model?: string;
		maxTokens?: number;
		temperature?: number;
		topP?: number;
		systemPrompt?: string;
	};

	type Props = {
		runId?: string;
		task: Task;
		componentProps?: AskComponentProps;
	};

	let { runId = undefined, task, componentProps = {} }: Props = $props();

	void runId;

	const DEFAULT_SYSTEM_PROMPT =
		'You are a concise assistant. Answer the question in one short paragraph. Avoid preambles and filler. Use Markdown formatting when appropriate.';
	const DEFAULT_MODEL = 'llama-server';
	const DEFAULT_MAX_TOKENS = 180;
	const DEFAULT_TEMPERATURE = 0.2;
	const DEFAULT_TOP_P = 0.9;

	let loading = $state(false);
	let error = $state<string | null>(null);
	let streamedText = $state('');

	function collectContext(content: Task['data']): string {
		if (typeof content === 'string') return content.trim();
		if (!Array.isArray(content)) return '';

		let text = '';
		for (const part of content) {
			if (
				part &&
				typeof part === 'object' &&
				'type' in part &&
				part.type === 'text' &&
				'text' in part
			) {
				const chunk = part.text;
				if (typeof chunk === 'string') text += chunk;
			}
		}

		return text.trim();
	}

	async function handleSubmit(prompt: string) {
		const trimmedPrompt = prompt.trim();
		if (!trimmedPrompt || loading) return;

		loading = true;
		error = null;
		streamedText = '';

		const context = collectContext(task.data);
		const systemPrompt =
			typeof componentProps.systemPrompt === 'string' && componentProps.systemPrompt.trim()
				? componentProps.systemPrompt.trim()
				: DEFAULT_SYSTEM_PROMPT;
		const model =
			typeof componentProps.model === 'string' && componentProps.model.trim()
				? componentProps.model.trim()
				: 'completionOptions' in task && task.completionOptions?.model
					? task.completionOptions.model
					: DEFAULT_MODEL;
		const maxTokens =
			typeof componentProps.maxTokens === 'number' && componentProps.maxTokens > 0
				? componentProps.maxTokens
				: DEFAULT_MAX_TOKENS;
		const temperature =
			typeof componentProps.temperature === 'number'
				? componentProps.temperature
				: DEFAULT_TEMPERATURE;
		const topP = typeof componentProps.topP === 'number' ? componentProps.topP : DEFAULT_TOP_P;

		const userContent = context
			? `Context:\n${context}\n\nQuestion:\n${trimmedPrompt}\n\nAnswer:`
			: `Question:\n${trimmedPrompt}\n\nAnswer:`;

		const request: LlamaChatCompletionsRequest = {
			model,
			messages: [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: userContent }
			],
			temperature,
			top_p: topP,
			max_completion_tokens: maxTokens
		};

		try {
			const response = await chatCompletions(request, {
				onToken: (token) => {
					streamedText += token;
				}
			});

			const finalText = response.choices?.[0]?.message?.content;
			if (typeof finalText === 'string' && finalText.trim()) {
				streamedText = finalText;
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Unknown error occurred';
		} finally {
			loading = false;
		}
	}
</script>

<div class="ask-task">
	<div class="ask-input" class:is-loading={loading}>
		<Input placeholder="Ask about this content..." disabled={loading} onEnter={handleSubmit} />
	</div>

	{#if error}
		<div class="ask-error">Error: {error}</div>
	{/if}

	{#if streamedText}
		<div class="ask-response">
			<MarkdownRenderer content={streamedText} />
		</div>
	{/if}
</div>

<style>
	.ask-task {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		width: 100%;
	}

	.ask-input {
		width: 100%;
		border-radius: 8px;
		position: relative;
		overflow: hidden;
	}

	.ask-input::after {
		content: '';
		position: absolute;
		bottom: 0;
		left: -100%;
		width: 100%;
		height: 2px;
		background: linear-gradient(90deg, transparent, var(--primary-color, #7c6af7), transparent);
		opacity: 0;
		transition: opacity 0.2s;
	}

	.ask-input.is-loading::after {
		opacity: 1;
		animation: ask-progress 1.2s linear infinite;
	}

	@keyframes ask-progress {
		from {
			left: -100%;
		}
		to {
			left: 100%;
		}
	}

	.ask-status {
		color: var(--primary-color);
		font-style: italic;
	}

	.ask-error {
		padding: 0.75rem;
		border-radius: 8px;
		background-color: rgba(255, 0, 0, 0.1);
		color: #ff5a5a;
		border: 1px solid rgba(255, 0, 0, 0.3);
	}

	.ask-response {
	}
</style>
