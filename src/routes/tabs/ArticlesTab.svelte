<script lang="ts">
	import ArticlesGrid from '@/components/ArticlesGrid.svelte';
	import ArticleItem from '@/components/ArticleItem.svelte';
	import Card from '@/components/Card.svelte';
	import LoadMoreSentinel from '@/components/LoadMoreSentinel.svelte';
	import { articleCacheStore } from '@/stores/articleCacheStore.svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import { goto } from '$app/navigation';
	import { urlRouter } from '@/lib/urlRouter/urlRouter';
	import { onMount } from 'svelte';
	import type { ArticleWithTasks } from '@/stores/webStore';
	import type { LayoutKey } from '@/components/MasonryGrid.svelte';

	onMount(async () => {
		await articleCacheStore.fetchArticlesWithoutProfile({
			onlyWithoutProfile: viewState.showOnlyRawArticles
		});
	});

	$effect(() => {
		const categories = [...viewState.selectedCategories];
		const onlyRaw = viewState.showOnlyRawArticles;
		void articleCacheStore.fetchArticlesWithoutProfile({
			force: true,
			categoryIds: categories,
			onlyWithoutProfile: onlyRaw
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

<ArticlesGrid items={articleCacheStore.articlesWithoutProfile}>
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
			onClick={handleArticleClick}
			onHoverEnter={handleArticleHoverEnter}
			onHoverLeave={handleArticleHoverLeave}
		/>
	{/snippet}
</ArticlesGrid>
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
