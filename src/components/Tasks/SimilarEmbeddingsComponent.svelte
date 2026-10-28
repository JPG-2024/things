<script lang="ts">
	import { goto } from '$app/navigation';
	import Icon from '@/components/Icon.svelte';
	import { tooltip } from '@/lib/actions/tooltip';
	import {
		findSimilarChunks,
		formatSearchChunkTooltip,
		type SearchChunkResult
	} from '@/lib/utils/embeddingStore';
	import { urlRouter } from '@/lib/urlRouter/urlRouter';
	import { viewState } from '@/stores/viewStore.svelte';
	import { getArticleThumbnailByUrl } from '@/stores/webStore';
	import type { ArticleWindow } from '@/types/articleAnalysis.types';
	import { SvelteMap } from 'svelte/reactivity';
	import { untrack } from 'svelte';

	type Props = {
		id: string;
		/** Windows whose field values are used as the query. */
		windows?: ArticleWindow[];
		/** Field of the window payload to search on. */
		field?: string;
		enabled?: boolean;
		manual?: boolean;
		articleUrl?: string | null;
		model?: string;
		limit?: number;
		maxResults?: number;
		maxDistance?: number;
		/**
		 * Externally supplied results (e.g. a chat retrieval across several
		 * tables). When set, they are rendered instead of running the internal
		 * search against table `id`.
		 */
		results?: SearchChunkResult[];
		/** Header label. Defaults to "Similar embeddings". */
		label?: string;
	};

	let {
		id,
		windows = [],
		field = 'summary',
		enabled = false,
		manual = false,
		articleUrl = viewState.url,
		model,
		limit = 5,
		maxResults = 15,
		maxDistance,
		results: externalResults = undefined,
		label = 'Similar embeddings'
	}: Props = $props();

	const queryChunks = $derived.by(() => {
		const chunks: string[] = [];
		for (const window of windows) {
			const value = window.data?.[field];
			if (typeof value === 'string' && value.trim()) {
				chunks.push(value);
				continue;
			}
			if (Array.isArray(value)) {
				for (const entry of value) {
					if (typeof entry === 'string' && entry.trim()) chunks.push(entry);
				}
			}
		}
		return chunks;
	});
	const hasQuery = $derived(queryChunks.length > 0);
	const serviceUp = $derived(viewState.embeddingsServiceUp);

	type GroupedResult = {
		articleUrl: string;
		chunks: SearchChunkResult[];
	};

	let searchResults = $state<SearchChunkResult[]>([]);
	let error = $state<string | null>(null);
	let hasSearched = $state(false);
	let thumbnails = $state<Record<string, string | null>>({});

	const effectiveResults = $derived(externalResults ?? searchResults);

	const groupedResults = $derived.by((): GroupedResult[] => {
		const map = new SvelteMap<string, GroupedResult>();
		for (const r of effectiveResults) {
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
		const entries = await Promise.all(
			groups.map(async (g) => [g.articleUrl, await getArticleThumbnailByUrl(g.articleUrl)] as const)
		);
		thumbnails = { ...thumbnails, ...Object.fromEntries(entries) };
	}

	// Resolve thumbnails for the current groups. The cache check reads
	// `thumbnails` untracked so updating it never re-triggers this effect.
	$effect(() => {
		const groups = groupedResults;
		untrack(() => {
			void loadThumbnails(groups.filter((g) => !(g.articleUrl in thumbnails)));
		});
	});

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

			searchResults = found;
			hasSearched = true;
			return found;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to search similar chunks';
			searchResults = [];
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
		{:else if hasSearched && searchResults.length === 0}
			<!-- <p class="similar-empty">No similar chunks found{hasQuery ? '' : ' for this task'}.</p> -->
		{:else if effectiveResults.length > 0}
			<p class="similar-header">{label} ({effectiveResults.length})</p>
			<div class="similar-thumbs">
				{#each groupedResults as group (group.articleUrl)}
					{@const tooltipText = formatSearchChunkTooltip(group.chunks)}
					<button
						class="similar-thumb-btn"
						onclick={() => navigateToArticle(group.articleUrl, group.chunks[0]?.profileId)}
						use:tooltip={{ content: tooltipText, position: 'bottom' }}
					>
						{#if thumbnails[group.articleUrl]}
							<img class="similar-thumb" src={thumbnails[group.articleUrl]} alt="" />
						{:else}
							<div class="similar-thumb-fallback">{group.chunks.length}</div>
						{/if}
					</button>
				{/each}
			</div>
		{/if}
	</div>
{/if}

<style>
	.similar-embeddings {
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
