<script lang="ts">
	import ProfileList from '@/components/ProfileList.svelte';
	import CategoryCard from './components/CategoryCard.svelte';
	import LoadMoreSentinel from '@/components/LoadMoreSentinel.svelte';
	import { CATEGORY_ARTICLE_COLUMN_WIDTH, TAB_PAGE_CONFIG } from '@/constants';
	import { articleCacheStore } from '@/stores/articleCacheStore.svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import { goto } from '$app/navigation';
	import { urlRouter } from '@/lib/urlRouter/urlRouter';
	import type { ArticleWithTasks, CategoryWithArticles } from '@/stores/webStore';
	import { tabAnimationStore } from '@/stores/tabAnimationStore.svelte';

	const categoryItemTransition = tabAnimationStore.transitionFor('categories');

	$effect(() => {
		const onlyArticlesAfter = viewState.onlyArticlesAfter;
		void articleCacheStore.fetchCategoriesWithArticles({
			categoryIds: [],
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

<ProfileList
	items={visibleCategories}
	itemTransition={categoryItemTransition}
	columns
	columnWidth={CATEGORY_ARTICLE_COLUMN_WIDTH}
	rowsPerColumn={TAB_PAGE_CONFIG.categories.rowsPerColumn}
	rowGap={1}
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

<style>
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
