<script lang="ts">
	import MasonryGrid from '@/components/MasonryGrid.svelte';
	import ArticleItem from '@/components/ArticleItem.svelte';
	import LoadMoreSentinel from '@/components/LoadMoreSentinel.svelte';
	import { articleCacheStore } from '@/stores/articleCacheStore.svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import type { RawSearchResult } from '@/stores/viewStore.svelte';
	import { goto } from '$app/navigation';
	import { urlRouter } from '@/lib/urlRouter/urlRouter';
	import type { ArticleWithTasks } from '@/stores/webStore';
	import type { LayoutKey } from '@/components/MasonryGrid.svelte';
	import { deleteSelectionStore } from '@/stores/deleteSelectionStore.svelte';
	import { INITIAL_TEMPLATE_ID } from '@/runners/templateConstants';

	const searchResults = $derived(viewState.rawSearchResults);

	function handleClearSearch() {
		viewState.rawSearchResults = null;
	}

	$effect(() => {
		const onlyRaw = viewState.showOnlyRawArticles;
		const profileId = viewState.activeArticleProfileId;
		const showOnlyInitial = viewState.showOnlyInitialArticles;
		void articleCacheStore.fetchArticlesWithoutProfile({
			onlyWithoutProfile: onlyRaw,
			profileId: profileId ?? undefined,
			templateId: showOnlyInitial ? INITIAL_TEMPLATE_ID : undefined
		});
	});

	function handleArticleClick(article: ArticleWithTasks) {
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

<div class="article-tab__container">
	{#if viewState.rawSearchLoading}
		<div class="empty-profiles-container">
			<div class="empty-profiles-pill">Searching raw content...</div>
		</div>
	{:else if searchResults !== null}
		<div class="search-results-header">
			<button type="button" class="search-results-clear" onclick={handleClearSearch}>
				{searchResults.length} result{searchResults.length !== 1 ? 's' : ''} — clear
			</button>
		</div>
		{#if searchResults.length > 0}
			<MasonryGrid
				items={searchResults}
				keyOf={(result: RawSearchResult) => result.article.url ?? ''}
				showContentModeToggle
			>
				{#snippet children(
					result: RawSearchResult,
					_i: number,
					_layoutIndex: number,
					layoutKey: LayoutKey
				)}
					<ArticleItem
						article={result.article}
						{layoutKey}
						animate={false}
						marked={deleteSelectionStore.markedUrls.has(result.article.url ?? '')}
						matchSnippet={result.match}
						onClick={handleArticleClick}
						onHoverEnter={handleArticleHoverEnter}
						onHoverLeave={handleArticleHoverLeave}
					/>
				{/snippet}
			</MasonryGrid>
		{:else}
			<div class="empty-profiles-container">
				<div class="empty-profiles-pill">No matches found</div>
			</div>
		{/if}
	{:else}
		<MasonryGrid items={articleCacheStore.articlesWithoutProfile} showContentModeToggle>
			{#snippet children(
				article: ArticleWithTasks,
				_i: number,
				_layoutIndex: number,
				layoutKey: LayoutKey
			)}
				<ArticleItem
					{article}
					{layoutKey}
					animate={false}
					marked={deleteSelectionStore.markedUrls.has(article.url ?? '')}
					onClick={handleArticleClick}
					onHoverEnter={handleArticleHoverEnter}
					onHoverLeave={handleArticleHoverLeave}
				/>
			{/snippet}
		</MasonryGrid>
		{#if articleCacheStore.loadingArticles}
			<div class="empty-profiles-container"></div>
		{:else if articleCacheStore.articlesWithoutProfile.length === 0}
			<div class="empty-profiles-container">
				<div class="empty-profiles-pill">No articles</div>
			</div>
		{/if}
		{#if articleCacheStore.hasMoreArticles}
			<LoadMoreSentinel
				onLoadMore={() => articleCacheStore.loadMoreArticles()}
				disabled={articleCacheStore.loadingArticles}
			/>
		{/if}
	{/if}
</div>

<style>
	.article-tab__container {
		padding: 2rem;
	}
	.empty-profiles-container {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
	}

	.empty-profiles-pill {
		opacity: 0.6;
		transition: opacity 0.15s;
		border: 1px dashed var(--primary-color);
		border-radius: var(--radius-lg);
		padding: 7px 20px;
		color: var(--primary-color);
		font-weight: bold;
		font-size: 0.88rem;
		line-height: 1.2;
	}

	.empty-profiles-pill:hover {
		opacity: 1;
	}

	.search-results-header {
		display: flex;
		justify-content: center;
		padding: 1rem 0;
	}

	.search-results-clear {
		all: unset;
		cursor: pointer;
		opacity: 0.6;
		transition: opacity 0.15s;
		border: 1px solid var(--primary-color);
		border-radius: var(--radius-sm);
		padding: 7px 20px;
		color: var(--primary-color);
		font-weight: bold;
		font-size: 0.88rem;
		line-height: 1.2;
	}

	.search-results-clear:hover {
		opacity: 1;
	}
</style>
