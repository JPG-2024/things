<script lang="ts">
	import { goto } from '$app/navigation';
	import Pill from '@/components/Pill.svelte';
	import Tooltip from '@/components/Tooltip.svelte';
	import { formatSearchChunkTooltip } from '@/lib/utils/embeddingTasks';
	import { urlRouter } from '@/lib/urlRouter/urlRouter';
	import { SvelteMap } from 'svelte/reactivity';
	import { viewState } from '@/stores/viewStore.svelte';
	import { getArticleThumbnailByUrl } from '@/stores/webStore';
	import type { SearchChunkResult } from '@/lib/utils/embeddingStore';

	type Props = {
		text: string;
		results?: SearchChunkResult[];
	};

	let { text, results = [] }: Props = $props();

	type GroupedResult = {
		articleUrl: string;
		chunks: SearchChunkResult[];
	};

	/**
	 * One pill per article, ordered by its best (lowest) chunk distance.
	 * The same article may appear under several topics by design.
	 */
	const groupedResults = $derived.by((): GroupedResult[] => {
		const map = new SvelteMap<string, SearchChunkResult[]>();
		for (const result of results) {
			const chunks = map.get(result.articleUrl);
			if (chunks) chunks.push(result);
			else map.set(result.articleUrl, [result]);
		}
		return [...map.entries()]
			.map(([articleUrl, chunks]) => ({
				articleUrl,
				chunks: [...chunks].sort((a, b) => a.distance - b.distance)
			}))
			.sort((a, b) => a.chunks[0].distance - b.chunks[0].distance);
	});

	function bestDistance(chunks: SearchChunkResult[]): number {
		return chunks[0]?.distance ?? 1;
	}

	/**
	 * Resolved thumbnails keyed by article URL. Shared module-level cache in
	 * webStore dedupes fetches across topic instances; this state just makes
	 * the resolved values reactive per instance.
	 */
	let thumbnails = $state<Record<string, string | null>>({});

	$effect(() => {
		let cancelled = false;
		for (const group of groupedResults) {
			if (group.articleUrl in thumbnails) continue;
			void getArticleThumbnailByUrl(group.articleUrl).then((src) => {
				if (cancelled) return;
				thumbnails = { ...thumbnails, [group.articleUrl]: src };
			});
		}
		return () => {
			cancelled = true;
		};
	});

	/**
	 * Full URLs do not fit inside a pill: show hostname plus a trimmed slug,
	 * capped so the row stays compact.
	 */
	function shortenUrl(url: string): string {
		try {
			const parsed = new URL(url);
			const slug = parsed.pathname.split('/').filter(Boolean).pop();
			let label = slug ?? parsed.hostname;
			if (slug) label = `${parsed.hostname}/${label}`;
			return label.length > 24 ? `${label.slice(0, 24)}…` : label;
		} catch {
			return url.length > 24 ? `${url.slice(0, 24)}…` : url;
		}
	}

	function navigateToArticle(url: string, profileId?: string) {
		if (profileId) viewState.currentProfileId = profileId;
		urlRouter(url);
		if (url.startsWith('raw-')) goto(`/raw/${url}`);
		else goto(`/youtube/${encodeURIComponent(url)}`);
	}
</script>

<div class="pill-with-embeddings">
	<Pill status="idle" {text} showPoint />
	{#each groupedResults as group (group.articleUrl)}
		{@const thumbnailSrc = thumbnails[group.articleUrl]}
		<Tooltip
			content={`${shortenUrl(group.articleUrl)}\n${formatSearchChunkTooltip(group.chunks)}`}
			position="bottom"
		>
			<button
				class="article-pill"
				onclick={() => navigateToArticle(group.articleUrl, group.chunks[0]?.profileId)}
			>
				{#if thumbnailSrc}
					<img class="article-thumb" src={thumbnailSrc} alt="" />
				{:else}
					<!-- Text fallback while the thumbnail resolves or when none exists -->
					{shortenUrl(group.articleUrl)}
				{/if}
				<span class="article-distance">{bestDistance(group.chunks).toFixed(2)}</span>
			</button>
		</Tooltip>
	{/each}
</div>

<style>
	.pill-with-embeddings {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
		min-width: 0;
	}

	.article-pill {
		all: unset;
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		cursor: pointer;
		font-family: 'CaskaydiaCove NFM Light';
		font-size: var(--pill-font-size, 0.7rem);
		color: var(--pill-text-color, rgb(219, 219, 219));
		background: rgba(255, 255, 255, 0.05);
		border-radius: var(--radius-md);
		padding: 2px 10px;
		max-width: 100%;
		overflow: hidden;
		transition: background 0.2s ease;
	}

	.article-pill:hover {
		background: rgba(255, 255, 255, 0.12);
	}

	.article-thumb {
		width: 2rem;
		height: 2rem;
		object-fit: cover;
		border-radius: var(--radius-sm);
	}

	.article-distance {
		font-size: 0.65rem;
		opacity: 0.6;
	}
</style>
