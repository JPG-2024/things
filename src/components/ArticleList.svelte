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

<div class="articles-container">
	<div class="articles-grid">
		{#each articles as article (article.url)}
			<div class="article-wrapper">
				<ArticleItem
					{article}
					{displayMode}
					onClick={onArticleClick}
					onHoverEnter={onArticleHoverEnter}
					onHoverLeave={onArticleHoverLeave}
				/>
			</div>
		{/each}
	</div>
</div>

<style>
	.articles-container {
		container-type: inline-size;
		width: 100%;
		display: flex;
		justify-content: center;
	}

	.articles-grid {
		column-count: 1;
		column-gap: 2rem;
		column-fill: auto;
		width: 100%;
		max-width: 1200px;
		padding-bottom: 20%;
	}

	@container (min-width: 500px) {
		.articles-grid {
			column-count: 2;
		}
	}

	.article-wrapper {
		min-width: 500px;
		display: flex;
		align-items: flex-start;
		padding-bottom: 2rem;
		break-inside: avoid;
	}
</style>
