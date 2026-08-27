<script lang="ts">
	import Input from '@/components/inputs/Input.component.svelte';
	import MarkdownRenderer from '@/components/MarkdownRenderer.svelte';
	import ToggleIcon from '@/components/ToggleIcon.svelte';
	import SimilarEmbeddingsComponent from '@/components/Tasks/SimilarEmbeddingsComponent.svelte';
	import {
		chatCompletions,
		type LlamaChatCompletionsRequest
	} from '@/lib/utils/inference/chat-completions-provider';
	import type { SearchChunkResult } from '@/lib/utils/embeddingStore';
	import type { Task, TaskComponentProps } from '@/types/taskRunner.types';
	import { viewState } from '@/stores/viewStore.svelte';
	import { ttsState } from '@/stores/ttsStore.svelte';

	type AskComponentProps = TaskComponentProps & {
		model?: string;
		maxTokens?: number;
		temperature?: number;
		topP?: number;
		systemPrompt?: string;
		placeholder?: string;
		embeddingTable?: string;
		searchLimit?: number;
		maxDistance?: number;
	};

	type Props = {
		runId?: string;
		task: Task;
		componentProps?: AskComponentProps;
		inputValue?: string;
	};

	let {
		runId = undefined,
		task,
		componentProps = {},
		inputValue = $bindable('')
	}: Props = $props();

	void runId;

	const DEFAULT_SYSTEM_PROMPT =
		'You are a concise assistant. Answer the question in one short paragraph. Avoid Markdown. and formating.';
	const DEFAULT_MODEL = 'llama-server';
	const DEFAULT_MAX_TOKENS = 500;
	const DEFAULT_TEMPERATURE = 0.2;
	const DEFAULT_TOP_P = 0.9;

	type SimilarEmbeddingsHandle = {
		run: (query?: string) => Promise<SearchChunkResult[]>;
	};

	let loading = $state(false);
	let error = $state<string | null>(null);
	let streamedText = $state('');
	let searchEnabled = $state(false);
	let tableInstances: SimilarEmbeddingsHandle[] = [];

	const tables = $derived.by(() => {
		const raw =
			typeof componentProps.embeddingTable === 'string' && componentProps.embeddingTable.trim()
				? componentProps.embeddingTable.trim()
				: 'topics';
		return raw
			.split(',')
			.map((t) => t.trim())
			.filter(Boolean);
	});

	const searchLimit = $derived(
		typeof componentProps.searchLimit === 'number' && componentProps.searchLimit > 0
			? componentProps.searchLimit
			: 5
	);

	const maxDistance = $derived(
		typeof componentProps.maxDistance === 'number' && Number.isFinite(componentProps.maxDistance)
			? componentProps.maxDistance
			: 0.32
	);

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

		let searchContext = '';
		if (searchEnabled) {
			const settled = await Promise.all(
				tables.map((_, i) => tableInstances[i]?.run(trimmedPrompt) ?? Promise.resolve([]))
			);
			const allResults = settled.flat();
			allResults.sort((a, b) => a.distance - b.distance);
			const merged = allResults.slice(0, searchLimit);
			searchContext = merged
				.map((r) => r.chunkText)
				.filter(Boolean)
				.join('\n\n');
		}

		const context = collectContext(task.data);
		const systemPrompt =
			typeof componentProps.systemPrompt === 'string' && componentProps.systemPrompt.trim()
				? componentProps.systemPrompt.trim()
				: DEFAULT_SYSTEM_PROMPT;
		const model =
			typeof componentProps.model === 'string' && componentProps.model.trim()
				? componentProps.model.trim()
				: 'completionOptions' in task &&
					  typeof task.completionOptions !== 'function' &&
					  task.completionOptions?.model
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

		const parts: string[] = [];
		if (searchContext) parts.push(`Relevant chunks:\n${searchContext}`);
		if (context) parts.push(`Context:\n${context}`);
		parts.push(`Avoid Makdown. Question:\n${trimmedPrompt}\n\nAnswer:`);
		const userContent = parts.join('\n\n');

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
			if (viewState.autoSpeechEnabled && streamedText.trim()) {
				viewState.ttsPlayerMode = 'mini';
				ttsState.generateFromClipboard(streamedText);
			}
		}
	}
</script>

<div class="ask-task">
	<div class="ask-input-row">
		<ToggleIcon
			name="FileDigit"
			bind:checked={searchEnabled}
			size={22}
			tooltipProps={{ content: 'search context' }}
		/>
		<div class="ask-input" class:is-loading={loading}>
			<Input
				placeholder={componentProps?.placeholder ?? 'Ask about this content...'}
				disabled={loading}
				bind:value={inputValue}
				onEnter={handleSubmit}
			/>
		</div>
	</div>

	{#if error}
		<div class="ask-error">Error: {error}</div>
	{/if}

	{#if streamedText}
		<div class="ask-response">
			<MarkdownRenderer content={streamedText} />
		</div>
	{/if}

	{#if searchEnabled}
		{#each tables as table, i (table)}
			<SimilarEmbeddingsComponent
				id={table}
				data={task.data}
				enabled={false}
				articleUrl={null}
				limit={searchLimit}
				maxResults={searchLimit}
				{maxDistance}
				bind:this={tableInstances[i]}
			/>
		{/each}
	{/if}
</div>

<style>
	.ask-task {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		width: 100%;
		padding: 1.5rem 0;
	}

	.ask-input-row {
		display: flex;
		align-items: center;
		gap: 1rem;
		width: 100%;
	}

	.ask-input {
		flex: 1;
		border-radius: var(--radius-md);
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
		border-radius: var(--radius-md);
		background-color: rgba(255, 0, 0, 0.1);
		color: #ff5a5a;
		border: 1px solid rgba(255, 0, 0, 0.3);
	}

	.ask-response {
		font-weight: 200;
		background: rgba(255, 255, 255, 0.05);
		padding: 1rem;
		border-radius: var(--radius-sm);
		border-left: 1px solid rgb(118, 118, 118);
		border-right: 1px solid rgb(118, 118, 118);
	}
</style>
