<script lang="ts">
	import type { ArticleWithTasks } from '@/stores/webStore';
	import type { RawSearchMatch } from '@/stores/viewStore.svelte';
	import ArticleThumbnail from './ArticleThumbnail.svelte';
	import ArticleTitle from './ArticleTitle.svelte';
	import ArticleMatchSnippet from './ArticleMatchSnippet.svelte';
	import ArticleCategoryPills from './ArticleCategoryPills.svelte';

	interface Props {
		article: ArticleWithTasks;
		categories: string[];
		showThumbnail: boolean;
		showText: boolean;
		matchSnippet?: RawSearchMatch;
	}

	let { article, categories, showThumbnail, showText, matchSnippet = undefined }: Props = $props();
</script>

<div class="article-content">
	{#if showThumbnail && article.thumbnailSrc}
		<ArticleThumbnail src={article.thumbnailSrc} url={article.url} />
	{/if}
	{#if showText}
		{#if matchSnippet}
			<ArticleMatchSnippet match={matchSnippet} />
		{:else}
			<ArticleTitle title={article.title} />
			<ArticleCategoryPills {categories} />
		{/if}
	{/if}
</div>

<style>
	.article-content {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		min-width: 0;
	}

	.article-content :global(.article-thumbnail-container) {
		flex: 0 0 150px;
		width: 150px;
		height: 80px;
		opacity: 0.8;
	}

	.article-content :global(.article-thumbnail) {
		aspect-ratio: 1;
		object-fit: cover;
		border-radius: var(--radius-md);
		opacity: 0.9;
	}

	.article-content :global(.article-title) {
		font-family: 'BetterVCR', monospace;
		font-variant: all-small-caps;
		flex: 1;
		font-size: 0.8rem;
		padding: 0 1rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.article-content :global(.article-categories) {
		flex: none;
		flex-wrap: nowrap;
		overflow: hidden;
		max-width: 40%;
		white-space: nowrap;
	}
</style>
