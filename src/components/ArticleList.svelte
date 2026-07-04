<script lang="ts">
	import type { ArticleWithTasks } from '@/stores/webStore';
	import ArticleItem from '@/components/ArticleItem.svelte';

	interface Props {
		articles: ArticleWithTasks[];
		displayMode?: 'thumbnail' | 'title';
		onArticleClick: (article: ArticleWithTasks) => void;
		onArticleHoverEnter: (article: ArticleWithTasks) => void;
		onArticleHoverLeave: () => void;
	}

	let {
		articles,
		displayMode = 'thumbnail',
		onArticleClick,
		onArticleHoverEnter,
		onArticleHoverLeave
	}: Props = $props();
</script>

<div class="articles-grid">
	{#each articles as article (article.url)}
		<ArticleItem
			{article}
			{displayMode}
			onClick={onArticleClick}
			onHoverEnter={onArticleHoverEnter}
			onHoverLeave={onArticleHoverLeave}
		/>
	{/each}
</div>

<style>
	.articles-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
		gap: 2rem;
		width: 100%;
		max-width: 1200px;
		padding-bottom: 20%;
	}
</style>
