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
		isFixedThumb: boolean;
		topics: string[];
		matchSnippet?: RawSearchMatch;
	}

	let {
		article,
		categories,
		showThumbnail,
		showText,
		isFixedThumb,
		topics,
		matchSnippet = undefined
	}: Props = $props();
</script>

<div class="article-content">
	<div class="article-item-info">
		{#if isFixedThumb}
			<ArticleThumbnail
				variant="fixed"
				src={showThumbnail ? article.thumbnailSrc : undefined}
				url={article.url}
				fallbackText={article.title?.slice(0, 80) ?? ''}
			/>
		{:else if showThumbnail && article.thumbnailSrc}
			<ArticleThumbnail src={article.thumbnailSrc} url={article.url} />
		{/if}
		{#if showText && !isFixedThumb}
			{#if matchSnippet}
				<ArticleMatchSnippet match={matchSnippet} />
			{:else}
				<ArticleTitle title={article.title} />
				<ArticleCategoryPills {categories} />
				<ArticleTopics {topics} />
			{/if}
		{/if}
	</div>
</div>

<style>
	.article-content {
		display: flex;
		align-items: flex-start;
		width: 100%;
		min-width: 0;
	}

	.article-item-info {
		display: flex;
		flex-direction: column;
		width: 100%;
		min-width: 0;
	}
</style>
