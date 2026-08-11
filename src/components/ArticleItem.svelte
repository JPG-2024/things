<script lang="ts">
	import type { ArticleWithTasks } from '@/stores/webStore';
	import { toVTName } from '@/lib/utils/url';
	import { fade } from 'svelte/transition';

	interface Props {
		article: ArticleWithTasks;
		displayMode?: 'thumbnail' | 'title';
		onClick: (article: ArticleWithTasks) => void;
		onHoverEnter: (article: ArticleWithTasks) => void;
		onHoverLeave: () => void;
	}

	let { article, displayMode = 'thumbnail', onClick, onHoverEnter, onHoverLeave }: Props = $props();

	const title = $derived(
		(
			(article.persistedTasks?.find((t) => t.name?.toLocaleLowerCase() === 'title')?.data as
				| string
				| undefined) ?? ''
		).slice(0, 200)
	);
</script>

<button
	type="button"
	class="article-card"
	onclick={() => onClick(article)}
	onmouseenter={() => onHoverEnter(article)}
	onmouseleave={onHoverLeave}
	aria-label="View article"
	in:fade={{ duration: 100 }}
	out:fade={{ duration: 200 }}
>
	<div class="article-content">
		{#if displayMode === 'thumbnail' && article.thumbnailSrc}
			<div class="article-thumbnail-container">
				<!-- 			{#if !article.viewed}
				<span class="unread-dot"></span>
			{/if} -->
				<!-- <Tooltip content={article.title ?? ''} position="auto"> -->
				<img
					src={article.thumbnailSrc}
					alt="Article"
					class="article-thumbnail"
					style={`view-transition-name: vt-main-image-${toVTName(article.url ?? '')}`}
				/>
				<!-- </Tooltip> -->
			</div>
		{/if}
		<div class="article-title">
			<span>{title}</span>
		</div>
	</div>
</button>

<style>
	.article-card {
		all: unset;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		transition: transform 0.15s;
		font-size: 0.9em;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 12px;
		padding: 1rem;
		box-sizing: border-box;
		border-left: 1px solid rgba(var(--primary-color), 0.5);
	}

	.article-content {
		display: flex;
		align-items: flex-start;
		width: 100%;
	}

	.article-title {
		flex: 1;
		font-weight: bold;
	}

	.article-card:hover {
		transform: scale(1.01);
	}

	.article-thumbnail-container {
		flex: 0 0 30%;
		position: relative;
		display: inline-flex;
		width: fit-content;
	}

	.article-thumbnail {
		display: block;
		border-radius: 15px;
		width: 80%;
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
		line-height: 1.2;
		text-align: left;
		overflow: hidden;
		-webkit-line-clamp: 4;
		-webkit-box-orient: vertical;
		line-clamp: 4;
		grid-column: span 2;
	}
</style>
