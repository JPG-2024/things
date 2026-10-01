<script lang="ts">
	import { goto } from '$app/navigation';
	import Icon from '@/components/Icon.svelte';
	import Tooltip from '@/components/Tooltip.svelte';
	import { findSimilarChunks, extractQueryChunks } from '@/lib/utils/embeddingTasks';
	import { urlRouter } from '@/lib/urlRouter/urlRouter';
	import { viewState } from '@/stores/viewStore.svelte';
	import { getArticleWithTasksByUrl } from '@/stores/webStore';
	import type { SearchChunkResult } from '@/lib/utils/embeddingStore';
	import { SvelteMap } from 'svelte/reactivity';

	type Props = {
		id: string;
		data?: unknown;
		enabled?: boolean;
		manual?: boolean;
		articleUrl?: string | null;
		model?: string;
		limit?: number;
		maxResults?: number;
		maxDistance?: number;
		embedField?: string;
	};

	let {
		id,
		data,
		enabled = false,
		manual = false,
		articleUrl = viewState.url,
		model,
		limit = 5,
		maxResults = 15,
		maxDistance,
		embedField = 'topics'
	}: Props = $props();

	const queryChunks = $derived(extractQueryChunks(data, embedField));
	const hasQuery = $derived(queryChunks.length > 0);
	const serviceUp = $derived(viewState.embeddingsServiceUp);

	type GroupedResult = {
		articleUrl: string;
		chunks: SearchChunkResult[];
	};

	let results = $state<SearchChunkResult[]>([]);
	let error = $state<string | null>(null);
	let hasSearched = $state(false);
	let thumbnails = $state<Record<string, string | null>>({});

	const groupedResults = $derived.by((): GroupedResult[] => {
		const map = new SvelteMap<string, GroupedResult>();
		for (const r of results) {
			let group = map.get(r.articleUrl);
			if (!group) {
				group = { articleUrl: r.articleUrl, chunks: [] };
				map.set(r.articleUrl, group);
			}
			group.chunks.push(r);
		}
		return [...map.values()];
	});

	async function loadThumbnails(groups: GroupedResult[]) {
		const urls = groups.map((g) => g.articleUrl);
		const entries = await Promise.all(
			urls.map(async (url) => {
				const article = await getArticleWithTasksByUrl(url);
				return [url, article?.thumbnailSrc ?? null] as const;
			})
		);
		thumbnails = Object.fromEntries(entries);
	}

	function formatTooltipContent(chunks: SearchChunkResult[]): string {
		return chunks
			.map((c) => {
				const dist = c.distance.toFixed(2);
				const excerpt = c.chunkText.length > 60 ? c.chunkText.slice(0, 60) + '…' : c.chunkText;
				return `${dist} - ${excerpt}`;
			})
			.join('\n');
	}

	async function navigateToArticle(url: string, profileId?: string) {
		if (profileId) viewState.currentProfileId = profileId;
		urlRouter(url);
		if (url.startsWith('raw-')) goto(`/raw/${url}`);
		else goto(`/youtube/${encodeURIComponent(url)}`);
	}

	async function runSearch(overrideQuery?: string): Promise<SearchChunkResult[]> {
		if (!serviceUp) return [];
		const chunks = overrideQuery ? [overrideQuery] : queryChunks;
		if (chunks.length === 0) return [];
		error = null;
		try {
			const found = await findSimilarChunks({
				table: id,
				queryChunks: chunks,
				model,
				limit,
				maxResults,
				maxDistance,
				excludeArticleUrl: articleUrl ?? undefined
			});

			results = found;
			void loadThumbnails(groupedResults);
			hasSearched = true;
			return found;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to search similar chunks';
			results = [];
			hasSearched = true;
			return [];
		}
	}

	export function run(overrideQuery?: string): Promise<SearchChunkResult[]> {
		return runSearch(overrideQuery);
	}

	$effect(() => {
		if (!manual && enabled && hasQuery && serviceUp) {
			void runSearch();
		}
	});
</script>

{#if serviceUp}
<div class="similar-embeddings">
	{#if manual && !hasSearched}
		<div class="manual-trigger">
			<Icon
				name="FileDigit"
				size={16}
				onClick={() => void runSearch()}
				tooltipProps={{ content: 'retrieve similar' }}
			/>
		</div>
	{/if}

	{#if error}
		<p class="similar-error">{error}</p>
	{:else if hasSearched && results.length === 0}
		<p class="similar-empty">No similar chunks found{hasQuery ? '' : ' for this task'}.</p>
	{:else if results.length > 0}
		<p class="similar-header">Similar embeddings ({results.length})</p>
		<div class="similar-thumbs">
			{#each groupedResults as group (group.articleUrl)}
				<Tooltip content={formatTooltipContent(group.chunks)} position="bottom">
					<button
						class="similar-thumb-btn"
						onclick={() => navigateToArticle(group.articleUrl, group.chunks[0]?.profileId)}
					>
						{#if thumbnails[group.articleUrl]}
							<img class="similar-thumb" src={thumbnails[group.articleUrl]} alt="" />
						{:else}
							<div class="similar-thumb-fallback">{group.chunks.length}</div>
						{/if}
					</button>
				</Tooltip>
			{/each}
		</div>
	{/if}
</div>
{/if}

<style>
	.similar-embeddings {
		margin-top: 0.5rem;
	}

	.manual-trigger {
		display: inline-flex;
		align-items: center;
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

	.similar-header {
		margin: 0.5rem 0 0.3rem;
		font-size: 0.8rem;
		opacity: 0.8;
	}

	.similar-thumbs {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.similar-thumb-btn {
		all: unset;
		display: inline-flex;
		cursor: pointer;
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.similar-thumb {
		width: 5rem;
		height: 4rem;
		object-fit: cover;
		border-radius: var(--radius-md);
		opacity: 0.8;
		transition: opacity 0.2s ease;
	}

	.similar-thumb-btn:hover .similar-thumb {
		opacity: 1;
	}

	.similar-thumb-fallback {
		width: 5rem;
		height: 4rem;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(255, 255, 255, 0.05);
		border-radius: var(--radius-md);
		font-size: 0.75rem;
		opacity: 0.7;
	}
</style>
