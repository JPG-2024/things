<script lang="ts">
	import type { ArticleRecord } from '@/stores/webStore';
	import type { RawSearchMatch } from '@/stores/viewStore.svelte';
	import ArticleThumbnail from './ArticleThumbnail.svelte';
	import ArticleTitle from './ArticleTitle.svelte';
	import ArticleMatchSnippet from './ArticleMatchSnippet.svelte';

	interface Props {
		article: ArticleRecord;
		showThumbnail: boolean;
		showText: boolean;
		isFixedThumb: boolean;
		thumbWidth?: number;
		thumbHeight?: number;
		unread?: boolean;
		tooltip?: string | null;
		matchSnippet?: RawSearchMatch;
		/** Renders the article title below the thumbnail (thumbnail-only mode). */
		showTitle?: boolean;
	}

	let {
		article,
		showThumbnail,
		showText,
		isFixedThumb,
		thumbWidth = undefined,
		thumbHeight = undefined,
		unread = false,
		tooltip = null,
		matchSnippet = undefined,
		showTitle = false
	}: Props = $props();
</script>

<div class="article-content">
	<div class="article-item-info">
		{#if showThumbnail}
			<ArticleThumbnail
				width={thumbWidth}
				height={thumbHeight}
				src={article.thumbnailSrc}
				url={article.url}
				fallbackText={article.title?.slice(0, 80) ?? ''}
				{unread}
				{tooltip}
			/>
		{/if}
		{#if showTitle}
			<div class="article-thumbnail-title">
				<ArticleTitle title={article.title} />
			</div>
		{/if}
		{#if showText && !isFixedThumb}
			{#if matchSnippet}
				<ArticleMatchSnippet match={matchSnippet} />
			{:else}
				<ArticleTitle title={article.title} />
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
		align-items: center;
		width: 100%;
		min-width: 0;
	}

	/* Title below the thumbnail. It stays in normal flow inside `.content`, so
	   MasonryGrid's height measurement includes this block and grows the item's
	   row span instead of clipping it. The full title wraps; nothing is
	   line-clamped. Width mirrors the 80% thumbnail. */
	.article-thumbnail-title {
		width: 80%;
		min-width: 0;
		padding-top: 1rem;
		overflow-wrap: break-word;
	}

	.article-thumbnail-title :global(.article-title) {
		font-size: 0.65rem;
		line-height: 1.2;
	}
</style>
