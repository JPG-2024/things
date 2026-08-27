<script lang="ts">
	import ArticleItem from '@/components/ArticleItem.svelte';
	import EmojiString from '@/components/EmojiString.svelte';
	import type { ArticleWithTasks, CategoryWithArticles } from '@/stores/webStore';

	interface Props {
		categories: CategoryWithArticles[];
		onArticleClick: (article: ArticleWithTasks) => void;
		onArticleHoverEnter: (article: ArticleWithTasks) => void;
		onArticleHoverLeave: () => void;
	}

	let { categories, onArticleClick, onArticleHoverEnter, onArticleHoverLeave }: Props = $props();
</script>

<div class="categories-articles">
	{#each categories as category (category.categoryId)}
		<section class="category-section">
			<h2 class="category-title"><EmojiString value={category.categoryName} /></h2>
			{#if category.articles.length > 0}
				<div class="category-articles-grid">
					{#each category.articles as article (article.url)}
						<ArticleItem
							{article}
							thumbnailOnly
							onClick={onArticleClick}
							onHoverEnter={onArticleHoverEnter}
							onHoverLeave={onArticleHoverLeave}
						/>
					{/each}
				</div>
			{:else}
				<div class="category-empty">No articles</div>
			{/if}
		</section>
	{/each}
</div>

<style>
	.categories-articles {
		display: flex;
		flex-direction: column;
		gap: 2rem;
		width: 100%;
		align-items: center;
	}

	.category-section {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		width: 100%;
	}

	.category-title {
		margin: 0;
		opacity: 0.85;
		text-transform: capitalize;
		color: var(--primary-color);
		font-size: 1rem;
		font-weight: bold;
	}

	.category-articles-grid {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 1rem;
		width: 100%;
	}

	.category-empty {
		opacity: 0.5;
		border: 1px dashed var(--primary-color);
		border-radius: var(--radius-lg);
		padding: 7px 20px;
		color: var(--primary-color);
		font-size: 0.88rem;
	}
</style>
