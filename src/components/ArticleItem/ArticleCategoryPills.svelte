<script lang="ts">
	import { viewState } from '@/stores/viewStore.svelte';
	import CategoryItem from '@/components/CategoryItem.svelte';

	interface Props {
		categories: string[];
	}

	let { categories }: Props = $props();

	function categoryLabel(value: string): string {
		return viewState.categories.find((category) => category.id === value)?.name ?? value;
	}
</script>

{#if categories.length > 0}
	<div class="article-categories">
		{#each categories as category, categoryIndex (`${category}-${categoryIndex}`)}
			<span class="article-category-pill"><CategoryItem value={categoryLabel(category)} /></span>
		{/each}
	</div>
{/if}

<style>
	.article-categories {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		justify-content: flex-end;
	}

	.article-category-pill {
		border-radius: var(--radius-lg);
		font-size: 0.8rem;
		font-weight: bold;
		text-transform: capitalize;
		background: rgba(var(--primary-color), 0.2);
		color: var(--bg-color);
	}
</style>
