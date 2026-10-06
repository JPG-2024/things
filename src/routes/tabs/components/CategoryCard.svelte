<script lang="ts">
	import Card from '@/components/Card.svelte';
	import ArticleItem from '@/components/ArticleItem.svelte';
	import CategoryItem from '@/components/CategoryItem.svelte';
	import WheelStage from '@/components/WheelStage.svelte';
	import type { ArticleWithTasks, CategoryWithArticles } from '@/stores/webStore';
	import { goto } from '$app/navigation';

	interface Props {
		category: CategoryWithArticles;
		onArticleClick: (article: ArticleWithTasks) => void;
		onArticleHoverEnter: (article: ArticleWithTasks) => void;
		onArticleHoverLeave: () => void;
	}

	let { category, onArticleClick, onArticleHoverEnter, onArticleHoverLeave }: Props = $props();

	const previewArticles = $derived(category.articles);

	function handleCategoryClick() {
		goto(`/category/${category.categoryId}?name=${encodeURIComponent(category.categoryName)}`);
	}
</script>

<div class="category-card">
	<Card>
		<button type="button" class="category-header" onclick={handleCategoryClick}>
			<CategoryItem value={category.categoryName} />
		</button>
		{#if previewArticles.length > 0}
			<WheelStage fadeEdges gap={12} scrollSpeed={6} keyboard label="Category articles">
				{#each previewArticles as article (article.url)}
					<ArticleItem
						{article}
						thumbnailOnly
						thumbnailWidth={140}
						thumbnailHeight={70}
						onClick={onArticleClick}
						onHoverEnter={onArticleHoverEnter}
						onHoverLeave={onArticleHoverLeave}
					/>
				{/each}
			</WheelStage>
		{:else}
			<div class="category-empty">No articles</div>
		{/if}
	</Card>
</div>

<style>
	.category-card {
		width: 100%;
		height: 140px;
		min-width: 0;
	}

	.category-header {
		all: unset;
		cursor: pointer;
		width: 100%;
		box-sizing: border-box;
		padding: 6px 10px;
		padding-bottom: 10px;
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
