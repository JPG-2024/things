<script lang="ts">
	import Card from '@/components/Card.svelte';
	import ArticleItem from '@/components/ArticleItem/ArticleItem.svelte';
	// Wheel cards show the latest 10 articles only; infinite scroll is disabled.
	// import LoadMoreSentinel from '@/components/LoadMoreSentinel.svelte';
	import { CATEGORY_ARTICLE_THUMBNAIL_HEIGHT, CATEGORY_ARTICLE_THUMBNAIL_WIDTH } from '@/constants';
	import type { ArticleWithTasks, CategoryWithArticles } from '@/stores/webStore';
	// import { articleCacheStore } from '@/stores/articleCacheStore.svelte';

	interface Props {
		category: CategoryWithArticles;
		onArticleClick: (article: ArticleWithTasks) => void;
		onArticleHoverEnter: (article: ArticleWithTasks) => void;
		onArticleHoverLeave: () => void;
	}

	let { category, onArticleClick, onArticleHoverEnter, onArticleHoverLeave }: Props = $props();

	const articles = $derived(category.articles);
	// Infinite scroll disabled: show only the latest ARTICLE_COUNT_PER_CATEGORY articles.
	// const hasMore = $derived(articleCacheStore.hasMoreCategoryArticlesFor(category.categoryId));
	// const loadingMore = $derived(articleCacheStore.loadingCategoryArticlesFor(category.categoryId));

	// function handleLoadMore() {
	// 	void articleCacheStore.loadMoreCategoryArticlesFor(category.categoryId);
	// }

	// Vertical wheel over the grid scrolls the grid instead of being converted
	// to horizontal scrolling by the surrounding WheelStage. At the grid's edges
	// the event is left to bubble so the wheel keeps chaining outward.
	function handleGridWheel(e: WheelEvent) {
		const el = e.currentTarget as HTMLDivElement;
		const max = el.scrollHeight - el.clientHeight;
		if (max <= 0) return;

		const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
		const atStart = el.scrollTop <= 0 && delta < 0;
		const atEnd = el.scrollTop >= max - 1 && delta > 0;
		if (atStart || atEnd) return;

		e.stopPropagation();
	}
</script>

<div class="category-card">
	<Card>
		{#if articles.length > 0}
			<div class="article-grid" onwheel={handleGridWheel}>
				{#each articles as article (article.url)}
					<ArticleItem
						{article}
						thumbnailOnly
						thumbnailWidth={CATEGORY_ARTICLE_THUMBNAIL_WIDTH}
						thumbnailHeight={CATEGORY_ARTICLE_THUMBNAIL_HEIGHT}
						onClick={onArticleClick}
						onHoverEnter={onArticleHoverEnter}
						onHoverLeave={onArticleHoverLeave}
					/>
				{/each}
				<!-- {#if hasMore}
					<div class="sentinel-row">
						<LoadMoreSentinel
							onLoadMore={handleLoadMore}
							disabled={loadingMore}
							rootMargin="100px"
						/>
					</div>
				{/if} -->
			</div>
		{:else}
			<div class="category-empty">No articles</div>
		{/if}
	</Card>
</div>

<style>
	.category-card {
		width: 100%;
		min-width: 0;
	}

	.article-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.5rem;
		align-content: start;
		width: 100%;
		min-height: 0;
		/* Clamp the grid so the card behaves like a fixed-height viewport inside
		   the wheel track (track height is min(70vh, 44rem)). */
		max-height: calc(min(70vh, 44rem) - 5rem);
		overflow-y: auto;
		scrollbar-width: none;
	}

	.article-grid::-webkit-scrollbar {
		display: none;
	}

	.sentinel-row {
		grid-column: 1 / -1;
		min-height: 40px;
		display: flex;
		align-items: center;
	}

	.category-empty {
		opacity: 0.5;
		border: 1px dashed var(--primary-color);
		border-radius: var(--radius-lg);
		padding: 7px 20px;
		color: var(--primary-color);
		font-size: 0.88rem;
		text-align: center;
	}
</style>
