<script lang="ts">
	import Card from '@/components/Card.svelte';
	import ArticleItem from '@/components/ArticleItem.svelte';
	import EmojiString from '@/components/EmojiString.svelte';
	import type { ArticleWithTasks, CategoryWithArticles } from '@/stores/webStore';
	import { goto } from '$app/navigation';

	interface Props {
		category: CategoryWithArticles;
		onArticleClick: (article: ArticleWithTasks) => void;
		onArticleHoverEnter: (article: ArticleWithTasks) => void;
		onArticleHoverLeave: () => void;
	}

	let { category, onArticleClick, onArticleHoverEnter, onArticleHoverLeave }: Props = $props();

	const previewArticles = $derived(category.articles.slice(0, 10));

	function handleCategoryClick() {
		goto(`/category/${category.categoryId}?name=${encodeURIComponent(category.categoryName)}`);
	}
</script>

<Card>
	<button type="button" class="category-header" onclick={handleCategoryClick}>
		<EmojiString value={category.categoryName} />
	</button>
	{#if previewArticles.length > 0}
		<div class="category-thumbnails">
			{#each previewArticles as article (article.url)}
				<ArticleItem
					{article}
					thumbnailOnly
					withBackground={false}
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

<style>
	.category-header {
		all: unset;
		cursor: pointer;
		width: 100%;
		box-sizing: border-box;
		padding: 6px 10px;
		padding-bottom: 25px;
	}

	.category-thumbnails {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1rem;
		width: 100%;
		box-sizing: border-box;
		padding: 5px;
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
