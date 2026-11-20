<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import type { ArticleRecord } from '@/stores/webStore';
	import { viewState } from '@/stores/viewStore.svelte';
	import type { ArticleContentMode, LayoutKey, RawSearchMatch } from '@/stores/viewStore.svelte';
	import Icon from '@/components/Icon.svelte';
	import ProfileThumb from '@/components/ProfileThumb.svelte';
	import ArticleItemRow from './ArticleItemRow.svelte';
	import ArticleItemGrid3 from './ArticleItemGrid3.svelte';
	import ArticleItemGrid from './ArticleItemGrid.svelte';
	import { ARTICLE_THUMBNAIL_SIZES, type ArticleThumbnailSize } from '@/constants';
	import { playerStore } from '@/stores/playerStore.svelte';

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
		/**
		 * Renders the profile/domain thumb at the card's corner; with a profile
		 * on the record the thumb opens the profile page (the raw-text fallback
		 * shows the same icon the Topbar uses in postview). Opt-in so non-list
		 * surfaces (EntityCard previews) keep the plain card.
		 */
		showProfileThumb?: boolean;
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
		showProfileThumb = false,
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

	// The profile page's topbar already names and shows the profile, so the
	// card's corner attribution (avatar or raw-text badge) is redundant on
	// /profile/* — every other surface keeps it.
	const onProfileRoute = $derived(page.route.id === '/profile/[profileId]');

	// The corner block paints when there is something to show: the avatar, or
	// the raw-text fallback badge for `raw-` articles.
	const hasCornerThumb = $derived(!!article.profilePictureSrc || !!article.url?.startsWith('raw-'));
	const showCornerThumb = $derived(showProfileThumb && !onProfileRoute && hasCornerThumb);
	// Rows carry the id in both fields (`profileId` is mapped from `profile`),
	// so either one identifies the profile the corner thumb opens.
	const profileThumbId = $derived(article.profileId ?? article.profile ?? null);
	// Raw articles (and rows missing the picture) keep the corner decorative:
	// no invisible focusable button is ever created.
	const openableCorner = $derived(
		showCornerThumb && profileThumbId !== null && !!article.profilePictureSrc
	);

	/** The corner thumb opens the profile page. It hangs off the card as a
	 *  sibling (the star's pattern), so the click never reaches the card's
	 *  own `handleCardClick`. */
	function handleProfileClick(): void {
		if (!profileThumbId) return;
		void goto(`/profile/${encodeURIComponent(profileThumbId)}`);
	}

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

	/** Shift+click plays the article straight in the floating player, skipping
	 * the reading view (the article stays unread). Only YouTube URLs have a
	 * player; on anything else the modifier is a no-op. Plain click is
	 * untouched and goes through the caller's `onClick`. */
	function handleCardClick(event: MouseEvent): void {
		if (event.shiftKey) {
			// Non-video URLs are a no-op, matching the old early return.
			playerStore.openFromUrl(article.url, article.thumbnailSrc);
			return;
		}
		onClick(article);
	}
</script>

{#snippet cardButton()}
	<button
		type="button"
		class="article-card {layoutKey ?? ''}"
		class:selected
		class:fixed-thumb-card={isFixedThumb}
		style={isFixedThumb ? `--fixed-thumb-w: ${resolvedThumbnailWidth}px;` : undefined}
		onclick={handleCardClick}
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

<!-- The star and the profile thumb cannot nest inside the card (a <button> in
     a <button> is invalid HTML), so these surfaces wrap the card in a
     positioned container and hang the controls off it as siblings. -->
{#if showFavorite || showCornerThumb}
	<div class="article-item">
		{@render cardButton()}
		{#if showFavorite}
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
					color="yellow"
					tooltipProps={{ content: favorite ? 'remove favorite' : 'add favorite' }}
				/>
			</button>
		{/if}
		{#if showCornerThumb}
			<!-- Attribution at the card corner, a sibling of the card button so a
			     profile click never opens the article. The interactive variant
			     uses ProfileThumb's own button (hover is forwarded); the raw
			     badge stays decorative and cannot steal the article click. -->
			<span class="article-profile-thumb">
				{#if openableCorner}
					<ProfileThumb
						src={article.profilePictureSrc}
						size={30}
						ariaLabel="Open profile"
						onClick={handleProfileClick}
						onMouseEnter={() => onHoverEnter(article)}
						onMouseLeave={onHoverLeave}
					/>
				{:else if article.url?.startsWith('raw-')}
					<span class="article-raw-badge" aria-hidden="true">
						<Icon name="ClipboardType" size={20} color="var(--bg-color)" />
					</span>
				{/if}
			</span>
		{/if}
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
		font-size: 1rem;
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
		border: none;
	}

	.article-card:hover :global(.article-thumbnail) {
		opacity: 1;
	}

	/* The corner thumb button overlaps the card as a sibling, so a pointer
	   resting on it no longer hovers the card; the wrapper stays hovered in
	   both cases, which keeps the thumbnail lit across the boundary. */
	.article-item:hover .article-card :global(.article-thumbnail) {
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

	/* Star at the card's top-right corner. Hidden until hover unless the
	   article is already a favorite. In grid mode that corner belongs to the
	   unread dot, so the override below steps the star beneath it. */
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

	/* Grid cards: the fixed thumbnail fills the card, so the unread dot
	   (top-right of the thumb) and the star (top-right of the card shell)
	   land on the same point. Step the star below the dot; row cards keep the
	   corner because their text column already separates the two. */
	.article-card.fixed-thumb-card + .article-star {
		top: 1.5rem;
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
		fill: yellow;
	}

	/* Profile/domain attribution at the card's corner (the star mirrors it at
	   the top-right). Absolute inside the `.article-item` wrapper, which is the
	   same box as the card, so it never changes the measured cell height.
	   z-index 6 paints over the selection tint (5) and below the unread dot
	   (8) and the star (9). The wrapper only positions; the button comes from
	   ProfileThumb. */
	.article-profile-thumb {
		position: absolute;
		left: -1rem;
		top: 0.25rem;
		display: flex;
		align-items: center;
		justify-content: center;
		line-height: 0;
		z-index: 6;
	}

	/* Raw-text articles have no profile/domain picture: show the same icon
	   the Topbar falls back to in postview, shaped like the avatar. It overlaps
	   the card button, so it must never steal the article click. */
	.article-raw-badge {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		pointer-events: none;
	}
</style>
