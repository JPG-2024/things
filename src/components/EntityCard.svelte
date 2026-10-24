<script lang="ts">
	import Card from '@/components/Card.svelte';
	import ArticleItem from '@/components/ArticleItem/ArticleItem.svelte';
	import { ENTITY_CARD_GAP_PX } from '@/constants';
	import { articleCapacity } from '@/lib/utils/cardLayout';
	import type { ArticleRecord } from '@/stores/webStore';
	import type { Snippet } from 'svelte';

	interface Props {
		articles: ArticleRecord[];
		/** Article grid columns inside the card. */
		columns: number;
		/**
		 * Article grid rows inside the card. Shrinking this is how callers
		 * implement collapse (e.g. `rows = 1` while collapsed).
		 */
		rows: number;
		/** Shows unread dots over not-yet-viewed article thumbnails. */
		unread?: boolean;
		loading?: boolean;
		/** Renders the card header: avatar, category label, actions. */
		header?: Snippet;
		/** Renders an empty-state body when the category/profile has no articles. */
		empty?: Snippet;
		onArticleClick: (article: ArticleRecord) => void;
		onArticleHoverEnter: (article: ArticleRecord) => void;
		onArticleHoverLeave: () => void;
	}

	let {
		articles,
		columns,
		rows,
		unread = false,
		loading = false,
		header = undefined,
		empty = undefined,
		onArticleClick,
		onArticleHoverEnter,
		onArticleHoverLeave
	}: Props = $props();

	// The grid is a fixed columns x rows cap: cards with fewer articles collapse
	// to their content instead of leaving empty slots behind.
	const visibleArticles = $derived(articles.slice(0, articleCapacity(columns, rows)));
</script>

<Card {loading} showBorders>
	{#if header}
		<div class="entity-header">
			{@render header()}
		</div>
	{/if}
	{#if visibleArticles.length}
		<div
			class="article-grid"
			style="--entity-columns: {columns}; --entity-gap: {ENTITY_CARD_GAP_PX}px;"
		>
			{#each visibleArticles as article (article.url)}
				<ArticleItem
					{article}
					thumbnailOnly
					thumbnailSize="sm"
					unread={unread && !article.viewed}
					tooltip={article.title ?? null}
					onClick={onArticleClick}
					onHoverEnter={onArticleHoverEnter}
					onHoverLeave={onArticleHoverLeave}
				/>
			{/each}
		</div>
	{:else}
		{@render empty?.()}
	{/if}
</Card>

<style>
	.entity-header {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.4rem;
		margin-bottom: 0.5rem;
		width: 100%;
	}

	.entity-header:empty {
		display: none;
	}

	/* Fixed columns x rows grid; thumbnails fill each cell (16:9 kept by
	   ArticleThumbnail itself). */
	.article-grid {
		display: grid;
		grid-template-columns: repeat(var(--entity-columns, 2), minmax(0, 1fr));
		grid-auto-rows: auto;
		align-content: start;
		gap: var(--entity-gap, 12px);
		width: 100%;
		min-height: 0;
	}

	.article-grid :global(.article-card) {
		min-width: 0;
	}
</style>
