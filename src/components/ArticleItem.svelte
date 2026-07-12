<script lang="ts">
	import type { ArticleWithTasks } from '@/stores/webStore';
	import Tooltip from '@/components/Tooltip.svelte';
	import { toVTName } from '@/lib/utils/url';
	import { getTaskData } from '@/lib/utils/helpers/tasks';

	interface Props {
		article: ArticleWithTasks;
		displayMode?: 'thumbnail' | 'title';
		onClick: (article: ArticleWithTasks) => void;
		onHoverEnter: (article: ArticleWithTasks) => void;
		onHoverLeave: () => void;
	}

	let { article, displayMode = 'thumbnail', onClick, onHoverEnter, onHoverLeave }: Props = $props();

	const icons = $derived(getTaskData(article.persistedTasks, 'emojis'));
	const title = $derived(article.title?.slice(0, 60).concat('...') ?? '');
</script>

<button
	type="button"
	class="article-card"
	onclick={() => onClick(article)}
	onmouseenter={() => onHoverEnter(article)}
	onmouseleave={onHoverLeave}
	aria-label="View article"
>
	<div class="article-content">
		<div class="article-thumbnail-container">
			{#if !article.viewed}
				<span class="unread-dot"></span>
			{/if}
			{#if displayMode === 'thumbnail' && article.thumbnailSrc}
				<Tooltip content={article.title ?? ''} position="auto">
					<img
						src={article.thumbnailSrc}
						alt="Article"
						class="article-thumbnail"
						style={`view-transition-name: vt-main-image-${toVTName(article.url ?? '')}`}
					/>
				</Tooltip>
			{/if}
		</div>
		<div class="article-title">
			<span>{article.title ?? ''}</span>
		</div>
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
		border-radius: 5px;
		width: 100%;
		aspect-ratio: 16 / 10;
		object-fit: cover;
	}

	.article-thumbnail-raw {
		display: -webkit-box;
		justify-content: center;
		align-items: center;
		border-radius: 5px;
		width: 100%;
		aspect-ratio: 16 / 10;
		padding: 0.5rem;
		background: rgba(255, 255, 255, 0.05);
		color: rgba(255, 255, 255, 0.75);
		font-size: 0.65em;
		line-height: 1.2;
		text-align: left;
		overflow: hidden;
		-webkit-line-clamp: 4;
		-webkit-box-orient: vertical;
		line-clamp: 4;
		grid-column: span 2;
	}
</style>
