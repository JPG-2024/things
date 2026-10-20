<script lang="ts">
	import ProfileList from '@/components/ProfileList.svelte';
	import CategoryCard from './components/CategoryCard.svelte';
	import LoadMoreSentinel from '@/components/LoadMoreSentinel.svelte';
	import { entityColumnWidth } from '@/lib/utils/cardLayout';
	import { articleCacheStore } from '@/stores/articleCacheStore.svelte';
	import { viewState, articleFilters } from '@/stores/viewStore.svelte';
	import { goto } from '$app/navigation';
	import { urlRouter } from '@/lib/urlRouter/urlRouter';
	import type { ArticleWithTasks, CategoryWithArticles } from '@/stores/webStore';
	import { tabAnimationStore } from '@/stores/tabAnimationStore.svelte';

	const categoryItemTransition = tabAnimationStore.transitionFor('categories');
	const layout = $derived(viewState.cardLayout.categories);

	$effect(() => {
		const onlyArticlesAfter = viewState.onlyArticlesAfter;
		const card = viewState.cardLayout.categories;
		const categoryIds = articleFilters.ids('categories');
		void articleCacheStore.fetchCategoriesWithArticles({
			// Explicit ids: the store fetches one page per chosen category and
			// stops catalog paging. Empty list = full catalog as before.
			categoryIds,
			card,
			createdAtFrom: new Date(onlyArticlesAfter).getTime()
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

	function handleCategoryClick(category: CategoryWithArticles) {
		goto(`/category/${category.categoryId}?name=${encodeURIComponent(category.categoryName)}`);
	}

	// Ordering (most recent article first) and the "has articles" filter are
	// applied server-side so catalog paging stays consistent.
	const visibleCategories = $derived(articleCacheStore.categoriesWithArticles);
</script>

<div class="categories-tab">
	<ProfileList
		items={visibleCategories}
		itemTransition={categoryItemTransition}
		columns
		columnWidth={entityColumnWidth(layout)}
		cardsPerColumn={layout.cardsPerColumn}
		key={(category) => category.categoryId}
	>
		{#snippet row(category)}
			<CategoryCard
				{category}
				onCategoryClick={handleCategoryClick}
				onArticleClick={handleArticleClick}
				onArticleHoverEnter={handleArticleHoverEnter}
				onArticleHoverLeave={handleArticleHoverLeave}
			/>
		{/snippet}
		{#snippet sentinel()}
			{#if articleCacheStore.hasMoreCategories && visibleCategories.length > 0}
				<LoadMoreSentinel
					onLoadMore={() => articleCacheStore.loadMoreCategories()}
					disabled={articleCacheStore.loadingCategories}
				/>
			{/if}
		{/snippet}
	</ProfileList>
	{#if visibleCategories.length === 0}
		{#if articleCacheStore.loadingCategories}
			<div class="empty-profiles-container"></div>
		{:else}
			<div class="empty-profiles-container">
				<div class="empty-profiles-pill">No categories</div>
			</div>
		{/if}
	{/if}
</div>

<style>
	.categories-tab {
		padding-bottom: 4rem;
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
</style>
