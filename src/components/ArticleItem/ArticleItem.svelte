<script lang="ts">
	import type { ArticleRecord } from '@/stores/webStore';
	import { viewState } from '@/stores/viewStore.svelte';
	import type { ArticleContentMode, LayoutKey, RawSearchMatch } from '@/stores/viewStore.svelte';
	import Icon from '@/components/Icon.svelte';
	import ArticleItemRow from './ArticleItemRow.svelte';
	import ArticleItemGrid3 from './ArticleItemGrid3.svelte';
	import ArticleItemGrid from './ArticleItemGrid.svelte';
	import { ARTICLE_THUMBNAIL_SIZES, type ArticleThumbnailSize } from '@/constants';

	interface Props {
		article: ArticleRecord;
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
		selected?: boolean;
		matchSnippet?: RawSearchMatch;
		/**
		 * Renders the favorite star at the card's top-right corner. Opt-in so
		 * star-less surfaces (EntityCard previews) keep the plain button root.
		 */
		showFavorite?: boolean;
		/** Current favorite state; a saved favorite keeps the star visible. */
		favorite?: boolean;
		/** Fired by the star button; wiring lives with the caller. */
		onToggleFavorite?: (article: ArticleRecord) => void;
		onClick: (article: ArticleRecord) => void;
		onHoverEnter: (article: ArticleRecord) => void;
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
		selected = false,
		matchSnippet = undefined,
		showFavorite = false,
		favorite = false,
		onToggleFavorite = undefined,
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
	const showText = $derived(mode !== 'thumbnail' || matchSnippet !== undefined);

	// Title rendered below the thumbnail. Only the ArticleList thumbnail-only
	// mode opts in: EntityCard passes `thumbnailOnly` for its small preview
	// grids and stays caption-less. Without an image the placeholder already
	// shows the title, so the label is skipped there. The tooltip is dropped
	// here so hovering does not show the same title twice.
	const showThumbnailTitle = $derived(
		!thumbnailOnly && mode === 'thumbnail' && showThumbnail && !showText && !!article.thumbnailSrc
	);

	// El título se ofrece como tooltip cuando la tarjeta oculta el texto (modo
	// thumbnail), salvo que un caller pase un tooltip explícito. Centralizado aquí
	// para que todos los layouts y páginas que usan ArticleItem lo hereden.
	const resolvedTooltip = $derived(
		tooltip ?? (showThumbnail && !showText && !showThumbnailTitle ? (article.title ?? null) : null)
	);
</script>

{#snippet cardButton()}
	<button
		type="button"
		class="article-card {layoutKey ?? ''}"
		class:selected
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
				{showThumbnail}
				{showText}
				{matchSnippet}
				tooltip={resolvedTooltip}
				{unread}
			/>
		{:else if layoutKey === 'grid-3'}
			<ArticleItemGrid3
				{article}
				{showThumbnail}
				{showText}
				{matchSnippet}
				tooltip={resolvedTooltip}
				{unread}
			/>
		{:else}
			<ArticleItemGrid
				{article}
				{showThumbnail}
				{showText}
				{isFixedThumb}
				thumbWidth={resolvedThumbnailWidth}
				thumbHeight={resolvedThumbnailHeight}
				{unread}
				tooltip={resolvedTooltip}
				{matchSnippet}
				showTitle={showThumbnailTitle}
			/>
		{/if}
	</button>
{/snippet}

<!-- The star cannot nest inside the card (a <button> in a <button> is invalid
     HTML), so star-enabled surfaces wrap the card in a positioned container
     and hang the toggle off it as a sibling. -->
{#if showFavorite}
	<div class="article-item">
		{@render cardButton()}
		<button
			type="button"
			class="article-star"
			class:favorite
			onclick={() => onToggleFavorite?.(article)}
			aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'}
		>
			<Icon
				name="Star"
				size={16}
				color="var(--primary-color)"
				tooltipProps={{ content: favorite ? 'remove favorite' : 'add favorite' }}
			/>
		</button>
	</div>
{:else}
	{@render cardButton()}
{/if}

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

	/* Selection feedback: a primary-color tone over the thumbnail (image or
	   placeholder) instead of tinting the whole card. */
	.article-card.selected :global(.article-thumbnail-container)::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		background: color-mix(in srgb, var(--primary-color) 35%, transparent);
		pointer-events: none;
		z-index: 5;
	}

	.article-card.selected :global(.article-thumbnail) {
		filter: saturate(1.2) contrast(1.05);
		opacity: 1;
	}

	.article-card.fixed-thumb-card {
		flex: 0 0 auto;
		width: var(--fixed-thumb-w);
		min-width: var(--fixed-thumb-w);
		max-width: var(--fixed-thumb-w);
		padding: 0;
	}

	/* Positioned shell for the star sibling; must behave like the card for
	   layout purposes (grid cells, masonry width). */
	.article-item {
		position: relative;
		width: 100%;
		min-width: 0;
	}

	/* Star at the card's top-right corner, just left of the unread dot (which
	   sits at the thumbnail's own top-right corner). Hidden until hover unless
	   the article is already a favorite. */
	.article-star {
		position: absolute;
		top: 0.25rem;
		right: 0.25rem;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		background: none;
		border: none;
		cursor: pointer;
		line-height: 0;
		z-index: 9;
		opacity: 0;
		transition:
			opacity 0.15s,
			transform 0.15s;
	}

	.article-item:hover .article-star,
	.article-star.favorite,
	.article-star:focus-visible {
		opacity: 1;
	}

	.article-star:hover {
		transform: scale(1.15);
	}

	.article-star :global(svg) {
		fill: transparent;
	}

	.article-star.favorite :global(svg) {
		fill: var(--primary-color);
	}
</style>
