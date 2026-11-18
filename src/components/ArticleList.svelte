<script lang="ts">
	import { goto } from '$app/navigation';
	import type { Snippet } from 'svelte';
	import { createHotkey } from '@tanstack/svelte-hotkeys';
	import ArticleItem from '@/components/ArticleItem/ArticleItem.svelte';
	import LoadMoreSentinel from '@/components/LoadMoreSentinel.svelte';
	import Tabs from '@/components/Tabs.svelte';
	import ToggleIcon from '@/components/ToggleIcon.svelte';
	import InitialArticlesToggle from '@/components/InitialArticlesToggle.svelte';
	import {
		viewState,
		MASONRY_PRESETS,
		MASONRY_PRESET_ICONS,
		MASONRY_PRESET_LABELS
	} from '@/stores/viewStore.svelte';
	import type { ArticleContentMode, LayoutKey, RawSearchMatch } from '@/stores/viewStore.svelte';
	import type { ArticleRecord } from '@/stores/webStore';
	import { articleCacheStore } from '@/stores/articleCacheStore.svelte';
	import { selectedArticlesStore } from '@/stores/selectedArticlesStore.svelte';
	import { urlRouter } from '@/lib/urlRouter/urlRouter';
	import { enterLeave } from '@/lib/utils/itemTransitions';
	import type { ItemTransition, ItemTransitionOptions } from '@/lib/utils/itemTransitions';
	import ArticlesStack from '@/components/ArticlesStack.svelte';
	import {
		buildArticleGridCells,
		type ArticleGridCell,
		type ProfileStackCell
	} from '@/lib/utils/articleGridCells';
	import { ARTICLE_GRID_THUMBNAIL, ARTICLE_THUMBNAIL_SIZES } from '@/constants';

	interface Props {
		items: ArticleRecord[];
		/**
		 * Enables grouping articles into per-profile stack cells and exposes the
		 * `Alt+G` toggle. Off by default; pages that opt in (articles tab,
		 * category page) share the global `viewState.groupArticlesByProfile`.
		 */
		groupable?: boolean;
		keyOf?: (item: ArticleRecord) => string;
		itemTransition?: ItemTransition;
		matchOf?: (article: ArticleRecord) => RawSearchMatch | null;
		onArticleClick?: (article: ArticleRecord) => void | Promise<void>;
		headerLeft?: Snippet<[]>;
		/**
		 * Pins the layout to a preset key (e.g. `row` for search results)
		 * without touching the shared preset index. The rail hides its preset
		 * tabs while pinned, since the layout cannot be switched.
		 */
		presetOverride?: LayoutKey;
		emptyMessage?: string;
		loading?: boolean;
		hasMore?: boolean;
		onLoadMore?: () => void | Promise<void>;
	}

	let {
		items,
		groupable = false,
		keyOf = (item: ArticleRecord) => item.url ?? '',
		itemTransition,
		matchOf = undefined,
		onArticleClick = undefined,
		headerLeft,
		presetOverride = undefined,
		emptyMessage = 'No articles',
		loading = false,
		hasMore = false,
		onLoadMore = undefined
	}: Props = $props();

	// Vertical rail owning the preset switcher. Tab ids carry the preset index
	// so duplicate `key`s in MASONRY_PRESETS can never collide; the store stays
	// the single source of truth (the Alt+ArrowUp/Down hotkeys below stay in sync).
	const presetTabs = MASONRY_PRESETS.map((preset, index) => ({
		id: `preset-${index}`,
		label: MASONRY_PRESET_LABELS[preset.key] ?? preset.key,
		icon: MASONRY_PRESET_ICONS[preset.key]
	}));

	// Local mirror for bind:activeTab; the effect keeps it aligned when the
	// preset index changes programmatically (hotkeys). Same pattern as
	// ProfileList for upcoming writable-$derived refactors.
	// eslint-disable-next-line svelte/prefer-writable-derived
	let activePresetTab = $state(`preset-${viewState.masonryArticlesPresetIndex}`);
	$effect(() => {
		activePresetTab = `preset-${viewState.masonryArticlesPresetIndex}`;
	});

	function handleTabChange(tabId: string) {
		const index = Number(tabId.replace('preset-', ''));
		if (Number.isInteger(index) && index >= 0 && index < MASONRY_PRESETS.length) {
			viewState.masonryArticlesPresetIndex = index;
		}
	}

	// Layout derivation, formerly owned by MasonryGrid. A caller may pin a
	// layout (search results force `row`) without mutating the shared preset
	// index; otherwise the store's preset decides. The list only has two
	// container shapes: a plain column of rows, and a wrapping flex row of
	// fixed-size thumbnail cards for every grid preset.
	const activePreset = $derived(
		presetOverride
			? MASONRY_PRESETS.find((preset) => preset.key === presetOverride)
			: viewState.masonryPreset
	);
	const isRowMode = $derived(activePreset?.key === 'row');
	// Normalized for ArticleItem: every grid preset renders its thumbnail
	// layout (`grid-3` no longer exists, but a stale index would still land here).
	const layoutKey = $derived<LayoutKey>(isRowMode ? 'row' : 'grid');
	const itemContentMode = $derived<ArticleContentMode>(isRowMode ? 'both' : 'thumbnail');
	// Fixed grid card size. One source drives both the ArticleItem thumbnail
	// box (`thumbnailSize`) and the wrapping column width in the styles below.
	const gridItemWidth = $derived(ARTICLE_THUMBNAIL_SIZES[ARTICLE_GRID_THUMBNAIL].width);

	// The only-favorites view gets its own empty copy: the caller's message
	// ("No articles", "No music articles") would be a lie when the toggle is
	// what emptied the list.
	const effectiveEmptyMessage = $derived(viewState.onlyFavorites ? 'No favorites' : emptyMessage);

	// Alt+ArrowDown/Alt+ArrowUp step through MASONRY_PRESETS, clamped at both
	// ends. Re-homed from MasonryGrid, which this list no longer mounts. The
	// Alt modifier keeps plain arrow keys free for normal page scroll, and the
	// hotkeys stay inert while an overlay is open or the layout is pinned.
	function movePreset(delta: number) {
		if (presetOverride) return;
		const current = viewState.masonryArticlesPresetIndex;
		const next = Math.max(0, Math.min(current + delta, MASONRY_PRESETS.length - 1));
		if (next === current) return;
		viewState.masonryArticlesPresetIndex = next;
	}

	createHotkey(
		'Alt+ArrowDown',
		() => movePreset(1),
		() => ({
			enabled: !viewState.overlayOpen && !presetOverride,
			ignoreInputs: true,
			stopPropagation: true
		})
	);
	createHotkey(
		'Alt+ArrowUp',
		() => movePreset(-1),
		() => ({
			enabled: !viewState.overlayOpen && !presetOverride,
			ignoreInputs: true,
			stopPropagation: true
		})
	);

	function handleArticleClick(article: ArticleRecord) {
		if (onArticleClick) {
			void onArticleClick(article);
			return;
		}
		if (!article.url) return;
		urlRouter(article.url);
		goto(`/youtube/${encodeURIComponent(article.url)}`);
	}

	function handleArticleHoverEnter(article: ArticleRecord) {
		viewState.hoveredArticleUrl = article.url ?? null;
		viewState.hoveredPictureSrc = article.thumbnailSrc ?? null;
	}

	function handleArticleHoverLeave() {
		viewState.hoveredArticleUrl = null;
	}

	// Shift+F flips the only-favorites view. Registered here instead of the
	// global layout so the chord only fires while a list is on screen (and it
	// owns the chord: clear-filters moved to Shift+X).
	createHotkey(
		'Shift+F',
		() => {
			viewState.onlyFavorites = !viewState.onlyFavorites;
		},
		() => ({
			enabled: !viewState.overlayOpen,
			ignoreInputs: true,
			stopPropagation: true,
			preventDefault: true
		})
	);

	function handleStackClick(cell: ProfileStackCell) {
		goto(`/profile/${encodeURIComponent(cell.profileId)}`);
	}

	// Stars are persisted through the cache store, which repaints every loaded
	// list (and prunes the only-favorites lists when the toggle turns one off).
	function handleToggleFavorite(article: ArticleRecord) {
		if (!article.url) return;
		void articleCacheStore.setArticleFavorite(article.url, !article.favorite);
	}

	// Alt+G flips profile grouping. Only active when the caller opted in
	// (`groupable`), so the profile/category pages leave it inert.
	createHotkey(
		'G',
		() => {
			viewState.groupArticlesByProfile = !viewState.groupArticlesByProfile;
		},
		() => ({
			enabled: groupable && !viewState.overlayOpen,
			ignoreInputs: true,
			stopPropagation: true,
			preventDefault: true
		})
	);

	// Only-favorites view (Shift+F / the star rail toggle). Resource-backed
	// callers already query `favorite: true`, so their post-filter is a no-op;
	// this is what narrows the raw-search branch, whose query has no
	// server-side favorite parameter.
	const displayItems = $derived(
		viewState.onlyFavorites ? items.filter((article) => article.favorite === true) : items
	);

	// Grouping is a pure view derivation over the loaded (paginated) articles:
	// later pages merge into existing stacks, and toggling the flag swaps the
	// grid back to the flat article list without refetching. When grouping is
	// off, every article becomes its own cell, keeping the flat lists on the
	// exact previous rendering path.
	const gridItems = $derived(
		groupable && viewState.groupArticlesByProfile
			? buildArticleGridCells(displayItems)
			: displayItems.map((article) => ({
					kind: 'article' as const,
					key: keyOf(article),
					article
				}))
	);

	// Post-mount mirror of `gridItems`. Svelte suppresses intro transitions for
	// elements present during a component's initial render, so a list that is
	// already populated at mount (cached data, tab switches) would never
	// animate. Starting empty and filling the mirror in an effect makes the
	// keyed {#each} see an add, so items fade/slide in on every mount — the
	// window `tabAnimationStore` documents for tab switches.
	// eslint-disable-next-line svelte/prefer-writable-derived
	let renderedItems = $state<ArticleGridCell[]>([]);
	$effect(() => {
		renderedItems = gridItems;
	});

	// A grouping flip rewrites every cell key (url ↔ profile:<id>), so the keyed
	// {#each} would replay the tab transition across the whole list at once.
	// Suppress both halves of that one swap; mounts from load-more/search still
	// animate. The flag is a plain variable (not reactive): effect.pre sets it
	// before the DOM update and the transitions read it while the cells are
	// created/removed. It cannot be cleared from an effect: the post-mount
	// mirror assigns `renderedItems` in its own effect, so the keyed swap lands
	// a flush *later* than this flip — a macrotask timeout clears the flag only
	// after that swap has been applied (and clears it even when the flip happens
	// with zero items mounted). `lastGrouped` is seeded on the effect's first run
	// instead of at init, so no reactive value is read outside a reactive context.
	let suppressSwap = false;
	let lastGrouped: boolean | undefined = undefined;

	$effect.pre(() => {
		const grouped = groupable && viewState.groupArticlesByProfile;
		if (lastGrouped === undefined) {
			lastGrouped = grouped;
			return;
		}
		if (grouped === lastGrouped) return;
		lastGrouped = grouped;
		suppressSwap = true;
		setTimeout(() => {
			suppressSwap = false;
		}, 0);
	});

	function cellTransition(node: Element, options?: ItemTransitionOptions) {
		if (suppressSwap) return { duration: 0 };
		return (itemTransition ?? enterLeave)(node, options);
	}
</script>

<div class="article-list">
	<div class="article-list__body">
		<div class="article-list__rail">
			{#if !presetOverride}
				<Tabs
					tabs={presetTabs}
					bind:activeTab={activePresetTab}
					onTabChange={handleTabChange}
					iconSize={22}
					iconOnly
					vertical
				/>
			{/if}
			<!-- Always rendered (unlike Layers below): every ArticleList surface
			     honors the only-favorites view, and it sits above the grouping
			     toggle as the coarser of the two. -->
			<ToggleIcon
				name="Star"
				bind:checked={viewState.onlyFavorites}
				tooltipProps={{ content: 'only favorites {shift+f}' }}
			/>
			{#if groupable}
				<ToggleIcon
					name="Layers"
					bind:checked={viewState.groupArticlesByProfile}
					tooltipProps={{ content: 'group articles by profile (Alt+G)' }}
				/>
			{/if}
			<InitialArticlesToggle />
		</div>
		<div class="article-list__content">
			{#if headerLeft}
				<div class="article-list__header">
					{@render headerLeft()}
				</div>
			{/if}
			{#if gridItems.length > 0}
				<div
					class="article-list__items"
					class:row={isRowMode}
					class:grid={!isRowMode}
					style="--grid-item-width: {gridItemWidth}px"
				>
					{#each renderedItems as cell (cell.key)}
						<div class="article-list__item" in:cellTransition out:cellTransition>
							{#if cell.kind === 'stack'}
								<ArticlesStack {cell} {layoutKey} onClick={handleStackClick} />
							{:else}
								<ArticleItem
									article={cell.article}
									{layoutKey}
									contentMode={itemContentMode}
									thumbnailOnly={!isRowMode}
									thumbnailSize={!isRowMode ? ARTICLE_GRID_THUMBNAIL : undefined}
									tooltip={isRowMode ? null : (cell.article.title ?? null)}
									unread={!cell.article.viewed}
									selected={selectedArticlesStore.selectedUrls.has(cell.article.url ?? '')}
									matchSnippet={matchOf?.(cell.article) ?? undefined}
									showFavorite
									showProfileThumb
									favorite={cell.article.favorite === true}
									onToggleFavorite={handleToggleFavorite}
									onClick={handleArticleClick}
									onHoverEnter={handleArticleHoverEnter}
									onHoverLeave={handleArticleHoverLeave}
								/>
							{/if}
						</div>
					{/each}
				</div>
				{#if hasMore}
					<LoadMoreSentinel onLoadMore={() => onLoadMore?.()} disabled={loading} />
				{/if}
			{:else if loading}
				<div class="article-list__loading">
					<div class="article-list__spinner"></div>
				</div>
			{:else}
				<div class="article-list__empty">
					<div class="article-list__empty-pill">{effectiveEmptyMessage}</div>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.article-list {
		width: 100%;
	}

	.article-list__body {
		display: flex;
		align-items: flex-start;
		gap: 3rem;
		width: 100%;
		padding-bottom: 15rem;
	}

	/* Controls rail sized to its content, pinned near the top of the scrollport
	 * so switching presets stays possible while the list scrolls under it. */
	.article-list__rail {
		position: sticky;
		top: 1rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		padding-top: 1rem;
		width: max-content;
		flex-shrink: 0;
	}

	.article-list__content {
		min-width: 0;
		flex: 1;
	}

	.article-list__header {
		display: flex;
		justify-content: flex-end;
		gap: 2rem;
		padding: 0.2rem 2rem;
		width: 100%;
	}

	/* The only two container shapes: `row` is a plain column of full-width
	 * rows, `grid` a wrapping flex row of fixed-width thumbnail cards
	 * (--grid-item-width is set from ARTICLE_THUMBNAIL_SIZES). */
	.article-list__items {
		display: flex;
		gap: 1rem;
		padding-top: 1.3rem;
	}

	.article-list__items.row {
		flex-direction: column;
	}

	.article-list__items.grid {
		flex-direction: row;
		flex-wrap: wrap;
	}

	.article-list__item {
		min-width: 0;
		min-height: 90px;
	}

	.article-list__items.grid .article-list__item {
		flex: 0 0 var(--grid-item-width);
		width: var(--grid-item-width);
	}

	.article-list__loading {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 200px;
	}

	.article-list__spinner {
		width: 30px;
		height: 30px;
		border: 3px solid rgba(255, 255, 255, 0.2);
		border-top-color: var(--primary-color);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.article-list__empty {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		padding: 3rem 0;
	}

	.article-list__empty-pill {
		border: 2px dashed var(--bg-color);
		border-radius: var(--radius-md);
		padding: 7px 20px;
		font-family: var(--font-secondary);
		color: var(--primary-color);
		font-weight: bold;
		font-size: 0.88rem;
		line-height: 1.2;
	}
</style>
