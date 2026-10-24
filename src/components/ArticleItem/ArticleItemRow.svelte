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
		matchSnippet?: RawSearchMatch;
		tooltip?: string | null;
		unread?: boolean;
	}

	let {
		article,
		showThumbnail,
		showText,
		matchSnippet = undefined,
		tooltip = null,
		unread = false
	}: Props = $props();

	// Row thumbnails keep a fixed box regardless of the masonry preset; the box
	// itself is built by ArticleThumbnail so all sizing lives in one component.
	const ROW_THUMB_WIDTH = 150;
	const ROW_THUMB_HEIGHT = 80;
</script>

<div class="article-content">
	{#if showThumbnail}
		<ArticleThumbnail
			src={article.thumbnailSrc}
			url={article.url}
			width={ROW_THUMB_WIDTH}
			height={ROW_THUMB_HEIGHT}
			fallbackText={article.title?.trim().charAt(0) ?? ''}
			fallbackVariant="initial"
			{tooltip}
			{unread}
		/>
	{/if}
	{#if showText}
		{#if matchSnippet}
			<ArticleMatchSnippet match={matchSnippet} />
		{:else}
			<div class="article-row-text">
				<ArticleTitle title={article.title} />
			</div>
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
		font-family: var(--font-secondary);
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
