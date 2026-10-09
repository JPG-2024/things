<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import Icon from '@/components/Icon.svelte';
	import CategoryItem from '@/components/CategoryItem.svelte';
	import ArticleList from '@/components/ArticleList.svelte';
	import { articleCacheStore } from '@/stores/articleCacheStore.svelte';
	import { viewState } from '@/stores/viewStore.svelte';

	let categoryId = $derived(page.params.categoryId);
	let categoryName = $derived(page.url.searchParams.get('name') ?? categoryId);
	let categoryDescription = $derived(
		viewState.categories.find((c) => c.id === categoryId)?.description ?? null
	);

	onMount(async () => {
		await articleCacheStore.fetchArticlesByCategory(categoryId, { force: true });
	});

	function handleBack() {
		goto('/');
	}
</script>

<div class="category-page">
	<div class="top-bar">
		<button type="button" class="back-btn" onclick={handleBack} aria-label="Go back">
			<Icon name="ArrowLeft" size={24} />
		</button>
	</div>

	<div class="category-header">
		<h1 class="category-name"><CategoryItem value={categoryName} /></h1>
		{#if categoryDescription}
			<p class="category-description">{categoryDescription}</p>
		{/if}
	</div>

	<div class="articles-container">
		<ArticleList
			items={articleCacheStore.categoryArticles}
			loading={articleCacheStore.loadingCategoryArticles}
			hasMore={articleCacheStore.hasMoreCategoryArticles}
			onLoadMore={() => articleCacheStore.loadMoreCategoryArticles()}
		/>
	</div>
</div>

<style>
	.category-page {
		display: flex;
		flex-direction: column;
		align-items: center;
		min-height: 100vh;
		padding: 3rem;
		padding-right: 5rem;
	}

	.top-bar {
		width: 100%;
		margin-bottom: 1rem;
	}

	.back-btn {
		all: unset;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		padding: 0.5rem;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.08);
		transition: background 0.15s;
	}

	.back-btn:hover {
		background: rgba(255, 255, 255, 0.12);
	}

	.category-header {
		display: flex;
		flex-direction: row;
		align-items: baseline;
		gap: 0.75rem;
		margin-bottom: 2rem;
	}

	.category-name {
		font-size: 1.5rem;
		font-weight: 600;
		color: var(--primary-color);
		margin: 0;
		text-transform: capitalize;
	}

	.category-description {
		font-size: 0.9rem;
		color: var(--primary-color);
		opacity: 0.6;
		margin: 0;
	}

	.articles-container {
		width: 100%;
	}
</style>
