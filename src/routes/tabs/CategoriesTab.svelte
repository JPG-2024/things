<script lang="ts">
	import ProfileList from '@/components/ProfileList.svelte';
	import CategoryCard from './components/CategoryCard.svelte';
	import CategoryItem from '@/components/CategoryItem.svelte';
	import { CATEGORY_ARTICLE_COLUMN_WIDTH } from '@/constants';
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

	const visibleCategories = $derived(
		[...articleCacheStore.categoriesWithArticles]
			.sort((a, b) => {
				const dateA = (a.articles[0]?.createdAt as number) ?? 0;
				const dateB = (b.articles[0]?.createdAt as number) ?? 0;
				return dateB - dateA;
			})
			.filter((category) => category.articles.length > 0)
	);
</script>

<ProfileList
	items={visibleCategories}
	itemTransition={categoryItemTransition}
	columns
	columnWidth={CATEGORY_ARTICLE_COLUMN_WIDTH}
	key={(category) => category.categoryId}
>
	{#snippet header(category)}
		<button type="button" class="category-header" onclick={() => handleCategoryClick(category)}>
			<CategoryItem value={category.categoryName} />
		</button>
	{/snippet}
	{#snippet row(category)}
		<CategoryCard
			{category}
			onArticleClick={handleArticleClick}
			onArticleHoverEnter={handleArticleHoverEnter}
			onArticleHoverLeave={handleArticleHoverLeave}
		/>
	{/snippet}
</ProfileList>
{#if articleCacheStore.loadingCategories}
	<div class="empty-profiles-container"></div>
{:else if visibleCategories.length === 0}
	<div class="empty-profiles-container">
		<div class="empty-profiles-pill">No categories</div>
	</div>
{/if}

<style>
	.category-header {
		all: unset;
		cursor: pointer;
		display: block;
		width: 100%;
		box-sizing: border-box;
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
