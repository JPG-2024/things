<script lang="ts">
	import Input from '@/components/inputs/Input.component.svelte';
	import MarkdownRenderer from '@/components/MarkdownRenderer.svelte';
	import ToggleIcon from '@/components/ToggleIcon.svelte';
	import SimilarEmbeddingsComponent from '@/components/Tasks/SimilarEmbeddingsComponent.svelte';
	import LoadingBorder from '@/components/LoadingBorder.svelte';
	import {
		chatCompletions,
		type LlamaChatCompletionsRequest
	} from '@/lib/utils/inference/chat-completions-provider';
	import type { SearchChunkResult } from '@/lib/utils/embeddingStore';
	import { viewState } from '@/stores/viewStore.svelte';
	import { ttsState } from '@/stores/ttsStore.svelte';
	import { readRawContent } from '@/lib/utils/rawContent';
	import { articleState } from '@/stores/articleStore.svelte';

	type AskComponentProps = {
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
		/** Url of the article whose body is used as context. */
		url?: string | null;
		componentProps?: AskComponentProps;
		inputValue?: string;
	};

	let { url = null, componentProps = {}, inputValue = $bindable('') }: Props = $props();

	const DEFAULT_SYSTEM_PROMPT = 'Response using the context';
	const DEFAULT_MODEL = 'llama-server';
	const DEFAULT_MAX_TOKENS = 10000;
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

	const articleUrl = $derived(url ?? articleState.currentArticle.url);
	const windows = $derived(articleState.currentArticle.analysis?.windows ?? []);

	const tables = $derived.by(() => {
		// The default table is the one the analysis indexes into (`summary`);
		// a configured `embeddingTable` prop overrides it (comma-separated).
		const raw =
			typeof componentProps.embeddingTable === 'string' && componentProps.embeddingTable.trim()
				? componentProps.embeddingTable.trim()
				: viewState.chatSearchTables;
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

	/**
	 * The body of the article is read from its raw file on demand: it is never
	 * kept in the store, so asking a question is the only thing that pulls it
	 * into memory.
	 */
	async function collectContext(): Promise<string> {
		if (!articleUrl) return '';
		const content = await readRawContent(articleUrl);
		return content?.trim() ?? '';
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

		const context = await collectContext();
		const systemPrompt =
			typeof componentProps.systemPrompt === 'string' && componentProps.systemPrompt.trim()
				? componentProps.systemPrompt.trim()
				: DEFAULT_SYSTEM_PROMPT;
		const model =
			typeof componentProps.model === 'string' && componentProps.model.trim()
				? componentProps.model.trim()
				: viewState.aiModel || DEFAULT_MODEL;
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
			max_completion_tokens: maxTokens,
			reasoning_effort: 'high',
			n_predict: 5000
		};

		try {
			const response = await chatCompletions(request, {
				onToken: (token) => {
					streamedText += token;
				},
				onReasoningToken: (text) => console.log(text)
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
		<LoadingBorder {loading} animations={{ bottom: 'right' }}>
			<div class="ask-input">
				<Input
					placeholder={componentProps?.placeholder ?? 'Ask about this content...'}
					disabled={loading}
					bind:value={inputValue}
					onEnter={handleSubmit}
				/>
			</div>
		</LoadingBorder>
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
				{windows}
				field="summary"
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

	.ask-status {
		color: var(--primary-color);
		font-style: italic;
	}

	.ask-error {
		padding: 0.75rem;
		background-color: rgba(255, 0, 0, 0.1);
		color: #ff5a5a;
		border: 1px solid rgba(255, 0, 0, 0.3);
	}

	.ask-response {
		font-weight: 200;
		background: rgba(255, 255, 255, 0.05);
		padding: 1rem;
		border-radius: var(--radius-sm);
		border-left: 1px solid var(--bg-color);
	}
</style>
