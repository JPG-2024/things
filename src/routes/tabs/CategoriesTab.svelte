<script lang="ts">
	import CategoryCard from './components/CategoryCard.svelte';
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

	const sortedCategories = $derived(
		[...articleCacheStore.categoriesWithArticles].sort((a, b) => {
			const dateA = (a.articles[0]?.createdAt as number) ?? 0;
			const dateB = (b.articles[0]?.createdAt as number) ?? 0;
			return dateB - dateA;
		})
	);

	const visibleCategories = $derived(
		sortedCategories.filter((category) => category.articles.length > 0)
	);

	// Mirror the visible list after mount so the keyed {#each} sees items as
	// added. Svelte suppresses intro transitions for elements present during the
	// initial render, which is exactly the case when re-entering the tab with
	// cached categories.
	// The suggested writable $derived would evaluate during the initial render and
	// defeat this.
	// eslint-disable-next-line svelte/prefer-writable-derived
	let renderedCategories = $state<CategoryWithArticles[]>([]);

	$effect(() => {
		renderedCategories = visibleCategories;
	});
</script>

<div class="category-list">
	{#each renderedCategories as category (category.categoryId)}
		<div class="category-row" in:categoryItemTransition out:categoryItemTransition>
			<CategoryCard
				{category}
				onArticleClick={handleArticleClick}
				onArticleHoverEnter={handleArticleHoverEnter}
				onArticleHoverLeave={handleArticleHoverLeave}
			/>
		</div>
	{/each}
</div>
{#if articleCacheStore.loadingCategories}
	<div class="empty-profiles-container"></div>
{:else if visibleCategories.length === 0}
	<div class="empty-profiles-container">
		<div class="empty-profiles-pill">No categories</div>
	</div>
{/if}

<style>
	.category-list {
		display: flex;
		flex-direction: column;
		align-items: center;
		width: 100%;
		gap: 2rem;
	}

	.category-row {
		width: 100%;
		max-width: 80vw ;
		margin: 0 auto;
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
