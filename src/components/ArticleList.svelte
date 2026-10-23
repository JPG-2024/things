<script lang="ts">
	import { goto } from '$app/navigation';
	import type { Snippet } from 'svelte';
	import { createHotkey } from '@tanstack/svelte-hotkeys';
	import MasonryGrid from '@/components/MasonryGrid.svelte';
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
	import type { ArticleWithTasks } from '@/stores/webStore';
	import { selectedArticlesStore } from '@/stores/selectedArticlesStore.svelte';
	import { urlRouter } from '@/lib/urlRouter/urlRouter';
	import type { ItemTransition } from '@/lib/utils/itemTransitions';
	import ArticlesStack from '@/components/ArticlesStack.svelte';
	import {
		buildArticleGridCells,
		type ArticleGridCell,
		type ProfileStackCell
	} from '@/lib/utils/articleGridCells';

	interface Props {
		items: ArticleWithTasks[];
		/**
		 * Enables grouping articles into per-profile stack cells and exposes the
		 * `Alt+G` toggle. Off by default; pages that opt in (articles tab,
		 * category page) share the global `viewState.groupArticlesByProfile`.
		 */
		groupable?: boolean;
		keyOf?: (item: ArticleWithTasks) => string;
		itemTransition?: ItemTransition;
		matchOf?: (article: ArticleWithTasks) => RawSearchMatch | null;
		onArticleClick?: (article: ArticleWithTasks) => void | Promise<void>;
		headerLeft?: Snippet<[]>;
		/**
		 * Pins the grid to a preset layout (e.g. `row` for search results)
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
		keyOf = (item: ArticleWithTasks) => item.url ?? '',
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
	// the single source of truth (Alt+ArrowUp/Down in MasonryGrid stays in sync).
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

	function handleArticleClick(article: ArticleWithTasks) {
		if (onArticleClick) {
			void onArticleClick(article);
			return;
		}
		if (!article.url) return;
		urlRouter(article.url);
		goto(`/youtube/${encodeURIComponent(article.url)}`);
	}

	function handleArticleHoverEnter(article: ArticleWithTasks) {
		viewState.hoveredArticleUrl = article.url ?? null;
		viewState.hoveredPictureSrc = article.thumbnailSrc ?? null;
	}

	function handleArticleHoverLeave() {
		viewState.hoveredArticleUrl = null;
	}

	function handleStackClick(cell: ProfileStackCell) {
		goto(`/profile/${encodeURIComponent(cell.profileId)}`);
	}

	// Alt+G flips profile grouping. Only active when the caller opted in
	// (`groupable`), so the profile/category pages leave it inert.
	createHotkey(
		'Alt+G',
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

	// Grouping is a pure view derivation over the loaded (paginated) articles:
	// later pages merge into existing stacks, and toggling the flag swaps the
	// grid back to the flat article list without refetching. When grouping is
	// off, every article becomes its own cell, keeping the flat lists on the
	// exact previous rendering path.
	const gridItems = $derived(
		groupable && viewState.groupArticlesByProfile
			? buildArticleGridCells(items)
			: items.map((article) => ({
					kind: 'article' as const,
					key: keyOf(article),
					article
				}))
	);
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
			{#if gridItems.length > 0}
				<MasonryGrid
					items={gridItems}
					keyOf={(cell) => cell.key}
					{itemTransition}
					{headerLeft}
					{presetOverride}
				>
					{#snippet children(
						cell: ArticleGridCell,
						/* eslint-disable-next-line @typescript-eslint/no-unused-vars */
						_i: number,
						/* eslint-disable-next-line @typescript-eslint/no-unused-vars */
						_layoutIndex: number,
						layoutKey: LayoutKey,
						contentMode: ArticleContentMode
					)}
						{#if cell.kind === 'stack'}
							<ArticlesStack {cell} {layoutKey} onClick={handleStackClick} />
						{:else}
							<ArticleItem
								article={cell.article}
								{layoutKey}
								{contentMode}
								unread={!cell.article.viewed}
								selected={selectedArticlesStore.selectedUrls.has(cell.article.url ?? '')}
								matchSnippet={matchOf?.(cell.article) ?? undefined}
								onClick={handleArticleClick}
								onHoverEnter={handleArticleHoverEnter}
								onHoverLeave={handleArticleHoverLeave}
							/>
						{/if}
					{/snippet}
				</MasonryGrid>
				{#if hasMore}
					<LoadMoreSentinel onLoadMore={() => onLoadMore?.()} disabled={loading} />
				{/if}
			{:else if loading}
				<div class="article-list__loading">
					<div class="article-list__spinner"></div>
				</div>
			{:else}
				<div class="article-list__empty">
					<div class="article-list__empty-pill">{emptyMessage}</div>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.article-list {
		width: 100%;
		padding-right: 1.4rem;
	}

	.article-list__body {
		display: flex;
		align-items: flex-start;
		gap: 1rem;
		width: 100%;
	}

	/* Controls rail sized to its content, pinned near the top of the scrollport
	 * so switching presets stays possible while the grid scrolls under it. */
	.article-list__rail {
		position: sticky;
		top: 1rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2rem;
		width: max-content;
		flex-shrink: 0;
	}

	.article-list__content {
		min-width: 0;
		flex: 1;
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
