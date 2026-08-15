<script lang="ts">
	import { goto } from '$app/navigation';
	import ChunkList, { type ChunkEntry } from '@/components/ChunkList.svelte';
	import Icon from '@/components/Icon.svelte';
	import { findSimilarChunks, extractQueryChunks } from '@/lib/utils/embeddingTasks';
	import { urlRouter } from '@/lib/urlRouter/urlRouter';
	import { viewState } from '@/stores/viewStore.svelte';
	import { getArticleWithTasksByUrl } from '@/stores/webStore';
	import type { SearchChunkResult } from '@/lib/utils/embeddingStore';

	type Props = {
		id: string;
		data: unknown;
		enabled: boolean;
		articleUrl?: string | null;
		model?: string;
		limit?: number;
		maxResults?: number;
		maxDistance?: number;
	};

	let {
		id,
		data,
		enabled,
		articleUrl = viewState.url,
		model,
		limit = 5,
		maxResults = 15,
		maxDistance
	}: Props = $props();

	const queryChunks = $derived(extractQueryChunks(data));
	const hasQuery = $derived(queryChunks.length > 0);

	let results = $state<SearchChunkResult[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let hasSearched = $state(false);
	let similarThumbnails = $state<Record<string, string | null>>({});

	async function loadSimilarThumbnails(chunks: SearchChunkResult[]) {
		const urls = [...new Set(chunks.map((c) => c.articleUrl))];
		const entries = await Promise.all(
			urls.map(async (url) => {
				const article = await getArticleWithTasksByUrl(url);
				return [url, article?.thumbnailSrc ?? null] as const;
			})
		);
		similarThumbnails = Object.fromEntries(entries);
	}

	async function navigateToArticle(url: string, profileId?: string) {
		if (profileId) viewState.currentProfileId = profileId;
		urlRouter(url);
		if (url.startsWith('raw-')) goto(`/raw/${url}`);
		else goto(`/youtube/${encodeURIComponent(url)}`);
	}

	async function runSearch() {
		if (!hasQuery) return;
		loading = true;
		error = null;
		try {
			results = await findSimilarChunks({
				table: id,
				queryChunks,
				model,
				limit,
				maxResults,
				maxDistance,
				excludeArticleUrl: articleUrl ?? undefined
			});
			void loadSimilarThumbnails(results);
			hasSearched = true;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to search similar chunks';
			results = [];
			hasSearched = true;
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (enabled && hasQuery) {
			void runSearch();
		}
	});

	function formatDistance(value: number): string {
		return value.toFixed(2);
	}
</script>

<div class="similar-embeddings">
	<!-- 	<div class="similar-controls">
		<button class="find-similar" onclick={runSearch} disabled={!hasQuery || loading}>
			<Icon name="Search" size={12} color="var(--primary-color)" />
			{loading ? 'Searching…' : 'Find similar'}
		</button>
		{#if !hasQuery}
			<span class="hint">No comparable content in this task.</span>
		{/if}
	</div> -->

	{#if error}
		<p class="similar-error">{error}</p>
	{:else if hasSearched && results.length === 0}
		<p class="similar-empty">No similar chunks found{hasQuery ? '' : ' for this task'}.</p>
	{:else if results.length > 0}
		<ChunkList
			title="Similar embeddings ({results.length})"
			defaultOpen
			chunks={results.map(
				(r): ChunkEntry => ({
					id: r.id,
					summary: r.chunkText,
					thumbnail: similarThumbnails[r.articleUrl] ?? undefined,
					meta: `${formatDistance(r.distance)}`
				})
			)}
			onItemOpen={(_, i) => {
				const result = results[i];
				navigateToArticle(result.articleUrl, result.profileId);
			}}
		>
			{#snippet itemContent(chunk, i)}
				{@const result = results[i]}
				<div class="similar-meta">
					<span class="similar-url" title={result.articleUrl}>{result.articleUrl}</span>
					<span class="similar-distance">dist {formatDistance(result.distance)}</span>
				</div>
				<pre class="similar-text">{chunk.summary}</pre>
			{/snippet}
		</ChunkList>
	{/if}
</div>

<style>
	.similar-embeddings {
		margin-top: 0.5rem;
	}

	.similar-controls {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}

	.find-similar {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.25rem 0.6rem;
		border-radius: 8px;
		border: 1px solid color-mix(in srgb, var(--primary-color) 30%, transparent);
		background: rgba(255, 255, 255, 0.03);
		color: var(--primary-color);
		font-size: 0.78rem;
		cursor: pointer;
	}

	.find-similar:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.hint {
		font-size: 0.74rem;
		opacity: 0.6;
	}

	.similar-error {
		margin: 0.4rem 0 0;
		color: #ff8f8f;
		font-size: 0.8rem;
	}

	.similar-empty {
		margin: 0.4rem 0 0;
		font-size: 0.8rem;
		opacity: 0.7;
		font-style: italic;
	}

	.similar-meta {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		font-size: 0.72rem;
	}

	.similar-url {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		opacity: 0.7;
		max-width: 70%;
	}

	.similar-distance {
		flex-shrink: 0;
		opacity: 0.6;
		font-variant-numeric: tabular-nums;
	}

	.similar-text {
		margin: 0.3rem 0 0;
		max-height: 8rem;
		overflow: auto;
		font-size: 0.78rem;
		white-space: pre-wrap;
		word-break: break-word;
		font-family: 'CaskaydiaCove NFM Light', monospace;
		line-height: 1.4;
	}
</style>
