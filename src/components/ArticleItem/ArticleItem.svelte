<script lang="ts">
	import type { ArticleWithTasks } from '@/stores/webStore';
	import { viewState } from '@/stores/viewStore.svelte';
	import type { ArticleContentMode, LayoutKey, RawSearchMatch } from '@/stores/viewStore.svelte';
	import ArticleItemRow from './ArticleItemRow.svelte';
	import ArticleItemGrid3 from './ArticleItemGrid3.svelte';
	import ArticleItemGrid from './ArticleItemGrid.svelte';
	import { ARTICLE_THUMBNAIL_SIZES, type ArticleThumbnailSize } from '@/constants';

	interface Props {
		article: ArticleWithTasks;
		contentMode?: ArticleContentMode;
		thumbnailOnly?: boolean;
		/** Fixed preset for the thumbnail box; `fill` keeps it fluid (16:9, 100% wide). */
		thumbnailSize?: ArticleThumbnailSize;
		thumbnailWidth?: number;
		thumbnailHeight?: number;
		/** Shows the unread dot over the thumbnail. */
		unread?: boolean;
		/** Tooltip content shown when hovering the thumbnail. */
		tooltip?: string | null;
		layoutKey?: LayoutKey;
		marked?: boolean;
		matchSnippet?: RawSearchMatch;
		onClick: (article: ArticleWithTasks) => void;
		onHoverEnter: (article: ArticleWithTasks) => void;
		onHoverLeave: () => void;
	}

	let {
		article,
		contentMode = undefined,
		thumbnailOnly = false,
		thumbnailSize = undefined,
		thumbnailWidth = undefined,
		thumbnailHeight = undefined,
		unread = false,
		tooltip = null,
		layoutKey,
		marked = false,
		matchSnippet = undefined,
		onClick,
		onHoverEnter,
		onHoverLeave
	}: Props = $props();

	const isRowMode = $derived(layoutKey === 'row');
	const presetSize = $derived(
		thumbnailSize && thumbnailSize !== 'fill' ? ARTICLE_THUMBNAIL_SIZES[thumbnailSize] : undefined
	);

	const resolvedThumbnailWidth = $derived(thumbnailWidth ?? presetSize?.width);
	const resolvedThumbnailHeight = $derived(thumbnailHeight ?? presetSize?.height);
	const isFixedThumb = $derived(
		resolvedThumbnailWidth !== undefined && resolvedThumbnailHeight !== undefined
	);

	// Category previews force thumbnail-only; otherwise the grid-wide preference
	// (cycled from the masonry toolbar) decides what is rendered.
	const mode = $derived(
		contentMode ?? (thumbnailOnly ? 'thumbnail' : viewState.masonryArticlesContentMode)
	);
	// Text follows the content mode: `both` (row, grid-3) and `title` always show
	// text, `thumbnail` (grid) shows only the thumbnail slot. In grid-3 `both` with
	// no image the text renders alone; in row the empty placeholder sits beside it.
	const showThumbnail = $derived(mode !== 'title');
	const showText = $derived(mode !== 'thumbnail');

	// El título se ofrece como tooltip cuando la tarjeta oculta el texto (modo
	// thumbnail), salvo que un caller pase un tooltip explícito. Centralizado aquí
	// para que todos los layouts y páginas que usan ArticleItem lo hereden.
	const resolvedTooltip = $derived(
		tooltip ?? (showThumbnail && !showText ? (article.title ?? null) : null)
	);

	const categories = $derived(
		(article.persistedTasks?.find((t) => t.id === 'category')?.data as string[] | undefined) ?? []
	);

	function shuffle<T>(list: T[]): T[] {
		const copy = [...list];
		for (let i = copy.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[copy[i], copy[j]] = [copy[j], copy[i]];
		}
		return copy;
	}

	const someTopics = $derived.by(() => {
		const task = article.persistedTasks?.find((t) => t.id === 'analysis');
		const data = task?.data as unknown;
		if (Array.isArray(data)) {
			return data.filter((q): q is string => typeof q === 'string');
		}
		if (!data || typeof data !== 'object') return [];
		const topics = (data as Record<string, unknown>).topics;
		if (Array.isArray(topics)) {
			return topics.filter((q): q is string => typeof q === 'string');
		}
		return [];
	});

	// shuffled picks are memoized per article+question-count so unrelated article
	// object updates (store refreshes) don't re-shuffle and re-wrap the pills. It
	// lives in the shell (not ArticleTopics) so switching layout/content mode —
	// which remounts the layout subtree — does not pick a new pair.
	let randomTopicsKey = '';
	let randomTopicsMemo: string[] = [];
	const randomTopics = $derived.by(() => {
		const key = `${article.url ?? ''}:${someTopics.length}`;
		if (key !== randomTopicsKey) {
			randomTopicsKey = key;
			randomTopicsMemo = shuffle(someTopics).slice(0, 2);
		}
		return randomTopicsMemo;
	});
</script>

<button
	type="button"
	class="article-card {layoutKey ?? ''}"
	class:marked-for-delete={marked}
	class:fixed-thumb-card={isFixedThumb}
	style={isFixedThumb ? `--fixed-thumb-w: ${resolvedThumbnailWidth}px;` : undefined}
	onclick={() => onClick(article)}
	onmouseenter={() => onHoverEnter(article)}
	onmouseleave={onHoverLeave}
	aria-label="View article"
>
	{#if isRowMode}
		<ArticleItemRow
			{article}
			{categories}
			{showThumbnail}
			{showText}
			{matchSnippet}
			tooltip={resolvedTooltip}
			topics={randomTopics}
		/>
	{:else if layoutKey === 'grid-3'}
		<ArticleItemGrid3
			{article}
			{categories}
			{showThumbnail}
			{showText}
			topics={randomTopics}
			{matchSnippet}
			tooltip={resolvedTooltip}
		/>
	{:else}
		<ArticleItemGrid
			{article}
			{categories}
			{showThumbnail}
			{showText}
			{isFixedThumb}
			thumbWidth={resolvedThumbnailWidth}
			thumbHeight={resolvedThumbnailHeight}
			{unread}
			tooltip={resolvedTooltip}
			topics={randomTopics}
			{matchSnippet}
		/>
	{/if}
</button>

<style>
	.article-card {
		all: unset;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		transition: transform 0.15s;
		font-size: 1rem;
		border-radius: var(--radius-md);
		box-sizing: border-box;
		width: 100%;
		min-width: 0;
		max-width: 100%;
		position: relative;
	}

	.article-card {
		--keywords-font-size: 0.7rem;
		--pill-font-size: 0.6rem;
		--pill-text-color: rgb(163, 162, 162);
	}

	.article-card.grid-3 {
		background-image: linear-gradient(
			145deg,
			color-mix(in srgb, var(--primary-color) 15%, transparent),
			color-mix(in srgb, var(--bg-color) 15%, transparent),
			rgba(0, 0, 0),
			rgba(0, 0, 0)
		);
		padding: 14px 16px;
	}

	.article-card.row {
		padding: 0 1rem;
		border: none;
	}

	.article-card:hover :global(.article-thumbnail) {
		opacity: 1;
	}

	.article-card.marked-for-delete {
		--bg-color: red;
		border-top-color: red;
		background: rgba(255, 0, 0, 0.18);
	}

	.article-card.marked-for-delete.grid-3 {
		background-image: linear-gradient(
			180deg,
			color-mix(in srgb, red 20%, transparent),
			rgba(0, 0, 0),
			rgba(0, 0, 0)
		);
		background-color: rgba(255, 0, 0, 0.18);
	}

	.article-card.marked-for-delete.row {
		background: rgba(255, 0, 0, 0.25);
	}

	.article-card.fixed-thumb-card {
		flex: 0 0 auto;
		width: var(--fixed-thumb-w);
		min-width: var(--fixed-thumb-w);
		max-width: var(--fixed-thumb-w);
		padding: 0;
	}
</style>
