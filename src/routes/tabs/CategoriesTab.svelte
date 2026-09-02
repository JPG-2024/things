<script lang="ts">
	import CategoryArticles from '@/components/CategoryArticles.svelte';
	import ArticlesGrid from '@/components/ArticlesGrid.svelte';
	import CategoryCard from './components/CategoryCard.svelte';
	import { articleCacheStore } from '@/stores/articleCacheStore.svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import { goto } from '$app/navigation';
	import { urlRouter } from '@/lib/urlRouter/urlRouter';
	import { onMount } from 'svelte';
	import type { ArticleWithTasks, CategoryWithArticles } from '@/stores/webStore';

	function fetchCategories(force = false) {
		void articleCacheStore.fetchCategoriesWithArticles({
			force,
			categoryIds: [...viewState.selectedCategories],
			createdAtFrom: new Date(viewState.onlyArticlesAfter).getTime()
		});
	}

	onMount(() => {
		fetchCategories();
	});

	$effect(() => {
		const categories = [...viewState.selectedCategories];
		const onlyArticlesAfter = viewState.onlyArticlesAfter;
		void articleCacheStore.fetchCategoriesWithArticles({
			force: true,
			categoryIds: categories,
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

	const sortedCategories = $derived(
		[...articleCacheStore.categoriesWithArticles].sort((a, b) => {
			const dateA = (a.articles[0]?.createdAt as number) ?? 0;
			const dateB = (b.articles[0]?.createdAt as number) ?? 0;
			return dateB - dateA;
		})
	);
</script>

{#if viewState.selectedCategories.length === 0}
	<ArticlesGrid items={sortedCategories} keyOf={(c) => c.categoryId}>
		{#snippet children(category: CategoryWithArticles)}
			<CategoryCard
				{category}
				onArticleClick={handleArticleClick}
				onArticleHoverEnter={handleArticleHoverEnter}
				onArticleHoverLeave={handleArticleHoverLeave}
			/>
		{/snippet}
	</ArticlesGrid>
	{#if articleCacheStore.loadingCategories}
		<div class="empty-profiles-container"></div>
	{:else if articleCacheStore.categoriesWithArticles.length === 0}
		<div class="empty-profiles-container">
			<div class="empty-profiles-pill">No categories</div>
		</div>
	{/if}
{:else}
	<CategoryArticles
		categories={articleCacheStore.categoriesWithArticles}
		onArticleClick={handleArticleClick}
		onArticleHoverEnter={handleArticleHoverEnter}
		onArticleHoverLeave={handleArticleHoverLeave}
	/>
	{#if articleCacheStore.loadingCategories}
		<div class="empty-profiles-container"></div>
	{:else if articleCacheStore.categoriesWithArticles.length === 0}
		<div class="empty-profiles-container">
			<div class="empty-profiles-pill">No articles</div>
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
