<script lang="ts">
	import Card from '@/components/Card.svelte';
	import CategoryItem from '@/components/CategoryItem.svelte';
	import ArticleItem from '@/components/ArticleItem/ArticleItem.svelte';
	// Wheel cards show the latest ARTICLE_COUNT_PER_CATEGORY articles only;
	// catalog paging happens on the wheel (card) level, not inside the card.
	import { CATEGORY_ARTICLE_THUMBNAIL_HEIGHT, CATEGORY_ARTICLE_THUMBNAIL_WIDTH } from '@/constants';
	import type { ArticleWithTasks, CategoryWithArticles } from '@/stores/webStore';

	interface Props {
		category: CategoryWithArticles;
		onCategoryClick: (category: CategoryWithArticles) => void;
		onArticleClick: (article: ArticleWithTasks) => void;
		onArticleHoverEnter: (article: ArticleWithTasks) => void;
		onArticleHoverLeave: () => void;
	}

	let {
		category,
		onCategoryClick,
		onArticleClick,
		onArticleHoverEnter,
		onArticleHoverLeave
	}: Props = $props();

	const articles = $derived(category.articles);
</script>

<div class="category-card">
	<Card>
		<button type="button" class="category-header" onclick={() => onCategoryClick(category)}>
			<CategoryItem value={category.categoryName} />
		</button>
		{#if articles.length > 0}
			<div class="article-grid">
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

	.category-header {
		all: unset;
		cursor: pointer;
		display: block;
		width: 100%;
		box-sizing: border-box;
		padding-bottom: 10px;
	}

	.article-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.5rem;
		align-content: start;
		width: 100%;
		min-height: 0;
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
