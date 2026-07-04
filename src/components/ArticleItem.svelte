<script lang="ts">
	import type { ArticleWithTasks } from '@/stores/webStore';
	import Tooltip from '@/components/Tooltip.svelte';
	import { toVTName } from '@/lib/utils/url';

	interface Props {
		article: ArticleWithTasks;
		onClick: (article: ArticleWithTasks) => void;
		onHoverEnter: (article: ArticleWithTasks) => void;
		onHoverLeave: () => void;
	}

	let { article, onClick, onHoverEnter, onHoverLeave }: Props = $props();
</script>

<button
	type="button"
	class="article-card"
	onclick={() => onClick(article)}
	onmouseenter={() => onHoverEnter(article)}
	onmouseleave={onHoverLeave}
	aria-label="View article"
>
	<div class="article-thumbnail-container">
		{#if !article.viewed}
			<span class="unread-dot"></span>
		{/if}
		<Tooltip content={article.title ?? ''}>
			{#if article.thumbnailSrc}
				<img
					src={article.thumbnailSrc}
					alt="Article"
					class="article-thumbnail"
					style={`view-transition-name: vt-main-image-${toVTName(article.url ?? '')}`}
				/>
			{:else}
				<div class="article-thumbnail-raw" title={article.title ?? ''}>
					{article.title?.slice(0, 60).concat('...') ?? ''}
				</div>
			{/if}
		</Tooltip>
	</div>
</button>

<style>
	.article-card {
		all: unset;
		cursor: pointer;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		transition: transform 0.15s;
	}

	.article-card:hover {
		transform: scale(1.01);
	}

	.article-thumbnail-container {
		position: relative;
		display: inline-flex;
	}

	.article-thumbnail {
		display: block;
		border-radius: 12px;
		width: 100%;
		aspect-ratio: 16 / 10;
		object-fit: cover;
	}

	.article-thumbnail-raw {
		display: -webkit-box;
		justify-content: center;
		align-items: center;
		border-radius: 12px;
		width: 100%;
		aspect-ratio: 16 / 10;
		padding: 0.5rem;
		background: rgba(255, 255, 255, 0.05);
		color: rgba(255, 255, 255, 0.75);
		font-size: 0.7rem;
		line-height: 1.2;
		text-align: left;
		overflow: hidden;
		-webkit-line-clamp: 4;
		-webkit-box-orient: vertical;
		line-clamp: 4;
		grid-column: span 2;
	}
</style>
