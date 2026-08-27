<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import Icon from '@/components/Icon.svelte';
	import EmojiString from '@/components/EmojiString.svelte';
	import MasonryGrid from '@/components/MasonryGrid.svelte';
	import ArticleItem from '@/components/ArticleItem.svelte';
	import LoadMoreSentinel from '@/components/LoadMoreSentinel.svelte';
	import { articleCacheStore } from '@/stores/articleCacheStore.svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import { urlRouter } from '@/lib/urlRouter/urlRouter';
	import type { ArticleWithTasks } from '@/stores/webStore';

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

<div class="category-page">
	<div class="top-bar">
		<button type="button" class="back-btn" onclick={handleBack} aria-label="Go back">
			<Icon name="ArrowLeft" size={24} />
		</button>
	</div>

	<div class="category-header">
		<h1 class="category-name"><EmojiString value={categoryName} /></h1>
		{#if categoryDescription}
			<p class="category-description">{categoryDescription}</p>
		{/if}
	</div>

	<div class="articles-container">
		{#if articleCacheStore.categoryArticles.length > 0}
			<MasonryGrid items={articleCacheStore.categoryArticles}>
				{#snippet children(article: ArticleWithTasks, _i: number, _layoutIndex: number, layoutKey: string)}
				<ArticleItem
					{article}
					{layoutKey}
					onClick={handleArticleClick}
					onHoverEnter={handleArticleHoverEnter}
					onHoverLeave={handleArticleHoverLeave}
				/>
				{/snippet}
			</MasonryGrid>
		{:else if !articleCacheStore.loadingCategoryArticles}
			<div class="empty-state">
				<div class="empty-state-pill">No articles</div>
			</div>
		{/if}
		{#if articleCacheStore.loadingCategoryArticles && articleCacheStore.categoryArticles.length === 0}
			<div class="loading-container">
				<div class="loading-indicator"></div>
			</div>
		{/if}
		{#if articleCacheStore.hasMoreCategoryArticles}
			<LoadMoreSentinel
				onLoadMore={() => articleCacheStore.loadMoreCategoryArticles()}
				disabled={articleCacheStore.loadingCategoryArticles}
			/>
		{/if}
	</div>
</div>

<style>
	.category-page {
		display: flex;
		flex-direction: column;
		align-items: center;
		min-height: 100vh;
		padding: 1rem;
	}

	.top-bar {
		width: 100%;
		max-width: 1200px;
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

	.loading-container {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 200px;
	}

	.loading-indicator {
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
		max-width: 1200px;
	}

	.empty-state {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		padding: 3rem 0;
	}

	.empty-state-pill {
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
