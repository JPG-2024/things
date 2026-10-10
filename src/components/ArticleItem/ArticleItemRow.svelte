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

<div class="article-content">
	{#if showThumbnail}
		<ArticleThumbnail
			src={article.thumbnailSrc}
			url={article.url}
			fallbackText={article.title?.trim().charAt(0) ?? ''}
			fallbackVariant="initial"
		/>
	{/if}
	{#if showText}
		{#if matchSnippet}
			<ArticleMatchSnippet match={matchSnippet} />
		{:else}
			<div class="article-row-text">
				<ArticleTitle title={article.title} />
				<ArticleTopics {topics} />
			</div>
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
		object-fit: cover;
		border-radius: var(--radius-md);
		opacity: 0.9;
	}

	.article-row-text {
		flex: 1;
		min-width: 0;
		gap: 0.2rem;
		display: flex;
		flex-direction: column;
		justify-content: center;
		overflow: hidden;
	}

	.article-content :global(.article-title) {
		font-family: 'BetterVCR', monospace;
		font-variant: all-small-caps;
		flex: none;
		font-size: 0.8rem;
		padding: 0 1rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.article-row-text :global(.keywords) {
		padding: 0 1rem;
	}

	.article-content :global(.article-categories) {
		flex: none;
		flex-wrap: nowrap;
		overflow: hidden;
		max-width: 40%;
		white-space: nowrap;
	}
</style>
