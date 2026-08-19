<script lang="ts">
	import Input from '@/components/inputs/Input.component.svelte';
	import MarkdownRenderer from '@/components/MarkdownRenderer.svelte';
	import ChunkList, { type ChunkEntry } from '@/components/ChunkList.svelte';
	import ToggleIcon from '@/components/ToggleIcon.svelte';
	import {
		chatCompletions,
		type LlamaChatCompletionsRequest
	} from '@/lib/utils/inference/chat-completions-provider';
	import { createEmbeddings } from '@/lib/utils/inference/llama-completions';
	import { EMBEDDING_MODEL } from '@/lib/utils/inference/constants';
	import { searchChunks, type SearchChunkResult } from '@/lib/utils/embeddingStore';
	import { goto } from '$app/navigation';
	import { urlRouter } from '@/lib/urlRouter/urlRouter';
	import { getArticleWithTasksByUrl } from '@/stores/webStore';
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

	let loading = $state(false);
	let error = $state<string | null>(null);
	let streamedText = $state('');
	let retrievedChunks = $state<SearchChunkResult[]>([]);
	let searchEnabled = $state(true);
	let chunkThumbnails = $state<Record<string, string | null>>({});

	async function loadChunkThumbnails(chunks: SearchChunkResult[]) {
		const urls = [...new Set(chunks.map((c) => c.articleUrl))];
		const entries = await Promise.all(
			urls.map(async (url) => {
				const article = await getArticleWithTasksByUrl(url);
				return [url, article?.thumbnailSrc ?? null] as const;
			})
		);
		chunkThumbnails = Object.fromEntries(entries);
	}

	async function navigateToArticle(url: string, profileId?: string) {
		if (profileId) viewState.currentProfileId = profileId;
		urlRouter(url);
		if (url.startsWith('raw-')) goto(`/raw/${url}`);
		else goto(`/youtube/${encodeURIComponent(url)}`);
	}

	async function searchRelevantChunks(
		prompt: string,
		table: string,
		limit: number
	): Promise<SearchChunkResult[]> {
		try {
			const embeddingResponse = await createEmbeddings({
				model: EMBEDDING_MODEL,
				input: prompt
			});
			const embedding = embeddingResponse.data[0]?.embedding;
			if (!embedding) return [];
			return await searchChunks({ table, embedding, limit });
		} catch {
			return [];
		}
	}

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
		retrievedChunks = [];

		const embeddingTableRaw =
			typeof componentProps.embeddingTable === 'string' && componentProps.embeddingTable.trim()
				? componentProps.embeddingTable.trim()
				: 'topics';
		const tables = embeddingTableRaw
			.split(',')
			.map((t) => t.trim())
			.filter(Boolean);

		const searchLimit =
			typeof componentProps.searchLimit === 'number' && componentProps.searchLimit > 0
				? componentProps.searchLimit
				: 5;

		let searchContext = '';
		if (searchEnabled) {
			const allResults: SearchChunkResult[] = [];
			for (const table of tables) {
				const results = await searchRelevantChunks(trimmedPrompt, table, searchLimit);
				allResults.push(...results);
			}
			allResults.sort((a, b) => a.distance - b.distance);
			const merged = allResults.slice(0, searchLimit);
			retrievedChunks = merged;
			loadChunkThumbnails(merged);
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
		<div class="ask-input" class:is-loading={loading}>
			<Input
				placeholder={componentProps?.placeholder ?? 'Ask about this content...'}
				disabled={loading}
				bind:value={inputValue}
				onEnter={handleSubmit}
			/>
		</div>
		<ToggleIcon
			name="BrainCircuit"
			bind:checked={searchEnabled}
			size={18}
			tooltipProps={{ content: 'search context' }}
		/>
	</div>

	{#if error}
		<div class="ask-error">Error: {error}</div>
	{/if}

	{#if streamedText}
		<div class="ask-response">
			<MarkdownRenderer content={streamedText} />
		</div>
	{/if}

	{#if retrievedChunks.length > 0}
		<ChunkList
			title="Retrieved context ({retrievedChunks.length})"
			defaultOpen
			chunks={retrievedChunks.map(
				(chunk): ChunkEntry => ({
					id: chunk.id,
					summary: chunk.chunkText,
					thumbnail: chunkThumbnails[chunk.articleUrl] ?? undefined
				})
			)}
			onItemOpen={(_, i) => {
				const original = retrievedChunks[i];
				navigateToArticle(original.articleUrl, original.profileId);
			}}
		>
			{#snippet itemContent(chunk, i)}
				{@const original = retrievedChunks[i]}
				<div class="chunk-content">
					<p class="chunk-text">{chunk.summary}</p>
					<span
						class="chunk-source"
						role="button"
						tabindex={0}
						onclick={(e) => {
							e.preventDefault();
							e.stopPropagation();
							navigateToArticle(original.articleUrl, original.profileId);
						}}
						onkeydown={(e) => {
							if (e.key === 'Enter') navigateToArticle(original.articleUrl, original.profileId);
						}}>{original.articleUrl}</span
					>
				</div>
			{/snippet}
		</ChunkList>
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
		gap: 0.5rem;
		width: 100%;
	}

	.ask-input {
		flex: 1;
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

	.chunk-content {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		padding: 0.25rem 0;
	}

	.chunk-text {
		margin: 0;
		font-size: 0.85rem;
		line-height: 1.5;
	}

	.chunk-source {
		font-size: 0.75rem;
		opacity: 0.5;
		word-break: break-all;
		cursor: pointer;
		text-decoration: underline;
	}
</style>
