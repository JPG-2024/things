<script lang="ts">
	import type { ArticleWithTasks } from '@/stores/webStore';
	import type { RawSearchMatch } from '@/stores/viewStore.svelte';
	import ArticleThumbnail from './ArticleThumbnail.svelte';
	import ArticleTitle from './ArticleTitle.svelte';
	import ArticleMatchSnippet from './ArticleMatchSnippet.svelte';
	import ArticleCategoryPills from './ArticleCategoryPills.svelte';
	import ArticleTopics from './ArticleTopics.svelte';

	interface Props {
		article: ArticleWithTasks;
		categories: string[];
		showThumbnail: boolean;
		showText: boolean;
		topics: string[];
		matchSnippet?: RawSearchMatch;
	}

	let {
		article,
		categories,
		showThumbnail,
		showText,
		topics,
		matchSnippet = undefined
	}: Props = $props();
</script>

<div class="article-content" class:no-thumb={!(showThumbnail && article.thumbnailSrc)}>
	{#if showThumbnail && article.thumbnailSrc}
		<ArticleThumbnail src={article.thumbnailSrc} url={article.url} />
	{/if}
	{#if showText}
		{#if matchSnippet}
			<ArticleMatchSnippet match={matchSnippet} />
		{:else}
			<ArticleTitle title={article.title} />
			<ArticleTopics {topics} wrapped />
			<ArticleCategoryPills {categories} />
		{/if}
	{/if}
</div>

<style>
	.article-content {
		display: grid;
		grid-template-columns: minmax(0, 50%) minmax(0, 1fr);
		column-gap: 0.75rem;
		row-gap: 0.6rem;
		align-items: start;
		width: 100%;
		min-width: 0;
	}

	.article-content.no-thumb {
		grid-template-columns: minmax(0, 1fr);
	}

	.article-content :global(.article-thumbnail-container) {
		grid-column: 1;
		grid-row: 2;
		width: 100%;
		min-width: 0;
	}

	/* thumbnail-only mode: fill the card (no empty row above) */
	.article-content :global(.article-thumbnail-container:only-child) {
		grid-column: 1 / -1;
		grid-row: 1;
	}

	.article-content :global(.article-title) {
		font-family: 'BetterVCR', monospace;
		grid-column: 1 / -1;
		grid-row: 1;
		padding: 3px 0;
		font-size: 0.7rem;
		font-weight: bold;
		min-width: 0;
	}

	.article-content :global(.article-match-snippet) {
		grid-column: 1 / -1;
		grid-row: 1;
		min-width: 0;
	}

	.article-content :global(.article-item__keywords) {
		grid-column: 2;
		grid-row: 2;
		padding: 0.4rem 0;
		min-width: 0;
	}

	.article-content :global(.article-categories) {
		grid-column: 2;
		grid-row: 3;
		min-width: 0;
	}

	.article-content :global(.article-thumbnail) {
		max-width: 100%;
		min-width: 0;
	}

	/* no-thumb / title-only: collapse the empty left column */
	.article-content.no-thumb :global(.article-title),
	.article-content.no-thumb :global(.article-match-snippet),
	.article-content.no-thumb :global(.article-item__keywords),
	.article-content.no-thumb :global(.article-categories) {
		grid-column: 1 / -1;
	}
</style>
