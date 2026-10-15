<script lang="ts">
	import Card from '@/components/Card.svelte';
	import CategoryItem from '@/components/CategoryItem.svelte';
	import ArticleItem from '@/components/ArticleItem/ArticleItem.svelte';
	// Wheel cards show the latest ARTICLE_COUNT_PER_CATEGORY articles only;
	// catalog paging happens on the wheel (card) level, not inside the card.
	import { CATEGORY_CARD_GAP, CATEGORY_LABEL_COLUMN_WIDTH } from '@/constants';
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

<div class="category-card" style:gap={CATEGORY_CARD_GAP}>
	<div class="category-card-body">
		<Card showBorders>
			{#if articles.length > 0}
				<div class="article-grid">
					<button
						type="button"
						class="category-header"
						style:flex-basis={CATEGORY_LABEL_COLUMN_WIDTH}
						onclick={() => onCategoryClick(category)}
					>
						<CategoryItem value={category.categoryName} />
					</button>
					{#each articles as article (article.url)}
						<ArticleItem
							{article}
							thumbnailOnly
							thumbnailSize="sm"
							tooltip={article.title ?? null}
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
</div>

<style>
	.category-card {
		display: flex;
		flex-direction: row;
		align-items: center;
		width: 100%;
		min-width: 0;
	}

	.category-header {
		all: unset;
		cursor: pointer;
		flex: 0 0 auto;
		display: flex;
		justify-content: center;
		min-width: 0;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		box-sizing: border-box;
	}

	.category-header:hover {
		opacity: 0.8;
	}

	.category-card-body {
		flex: 1;
		min-width: 0;
	}

	.article-grid {
		display: flex;
		flex-direction: row;
		flex-wrap: nowrap;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		min-width: 0;
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
