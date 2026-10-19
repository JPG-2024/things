<script lang="ts">
	import EntityCard from '@/components/EntityCard.svelte';
	import CategoryItem from '@/components/CategoryItem.svelte';
	import { viewState } from '@/stores/viewStore.svelte';
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

	const layout = $derived(viewState.cardLayout.categories);
</script>

{#snippet categoryHeader()}
	<button type="button" class="category-header" onclick={() => onCategoryClick(category)}>
		<CategoryItem value={category.categoryName} />
	</button>
{/snippet}

{#snippet emptyState()}
	<div class="category-empty">No articles</div>
{/snippet}

<EntityCard
	articles={category.articles}
	columns={layout.columns}
	rows={layout.rows}
	header={categoryHeader}
	empty={emptyState}
	{onArticleClick}
	{onArticleHoverEnter}
	{onArticleHoverLeave}
/>

<style>
	.category-header {
		all: unset;
		cursor: pointer;
		display: flex;
		justify-content: flex-start;
		align-items: center;
		width: 100%;
		min-width: 0;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		box-sizing: border-box;
		padding: 0.5rem 0;
	}

	.category-header:hover {
		opacity: 0.8;
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
