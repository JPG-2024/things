<script lang="ts">
	import { goto } from '$app/navigation';
	import type { Snippet } from 'svelte';
	import MasonryGrid from '@/components/MasonryGrid.svelte';
	import ArticleItem from '@/components/ArticleItem/ArticleItem.svelte';
	import LoadMoreSentinel from '@/components/LoadMoreSentinel.svelte';
	import Tabs from '@/components/Tabs.svelte';
	import {
		viewState,
		MASONRY_PRESETS,
		MASONRY_PRESET_ICONS,
		MASONRY_PRESET_LABELS
	} from '@/stores/viewStore.svelte';
	import type { LayoutKey, RawSearchMatch } from '@/stores/viewStore.svelte';
	import type { ArticleWithTasks } from '@/stores/webStore';
	import { deleteSelectionStore } from '@/stores/deleteSelectionStore.svelte';
	import { urlRouter } from '@/lib/urlRouter/urlRouter';
	import type { ItemTransition } from '@/lib/utils/itemTransitions';

	interface Props {
		items: ArticleWithTasks[];
		keyOf?: (item: ArticleWithTasks) => string;
		itemTransition?: ItemTransition;
		matchOf?: (article: ArticleWithTasks) => RawSearchMatch | null;
		onArticleClick?: (article: ArticleWithTasks) => void | Promise<void>;
		headerLeft?: Snippet<[]>;
		emptyMessage?: string;
		loading?: boolean;
		hasMore?: boolean;
		onLoadMore?: () => void | Promise<void>;
	}

	let {
		items,
		keyOf = (item: ArticleWithTasks) => item.url ?? '',
		itemTransition,
		matchOf = undefined,
		onArticleClick = undefined,
		headerLeft,
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
</script>

<div class="article-list">
	<div class="article-list__body">
		<div class="article-list__rail">
			<Tabs
				tabs={presetTabs}
				bind:activeTab={activePresetTab}
				onTabChange={handleTabChange}
				iconSize={22}
				iconOnly
				vertical
			/>
		</div>
		<div class="article-list__content">
			{#if items.length > 0}
				<MasonryGrid {items} {keyOf} {itemTransition} {headerLeft}>
					{#snippet children(
						article: ArticleWithTasks,
						/* eslint-disable-next-line @typescript-eslint/no-unused-vars */
						_i: number,
						/* eslint-disable-next-line @typescript-eslint/no-unused-vars */
						_layoutIndex: number,
						layoutKey: LayoutKey
					)}
						<ArticleItem
							{article}
							{layoutKey}
							marked={deleteSelectionStore.markedUrls.has(article.url ?? '')}
							matchSnippet={matchOf?.(article) ?? undefined}
							onClick={handleArticleClick}
							onHoverEnter={handleArticleHoverEnter}
							onHoverLeave={handleArticleHoverLeave}
						/>
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
	}

	.article-list__body {
		display: flex;
		align-items: stretch;
		gap: 1rem;
		width: 100%;
	}

	/* Sticky preset rail: the column spans the scrollport while the grid scrolls
	 * under it, so switching presets is possible mid-scroll. The vertical Tabs
	 * centers its pills inside the viewport-height column. */
	.article-list__rail {
		position: sticky;
		top: 0;
		height: 100vh;
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
		opacity: 0.6;
		border: 1px dashed var(--primary-color);
		border-radius: var(--radius-lg);
		padding: 7px 20px;
		color: var(--primary-color);
		font-weight: bold;
		font-size: 0.88rem;
		line-height: 1.2;
	}
</style>
