<script lang="ts">
	import type { ArticleWithTasks } from '@/stores/webStore';
	import { toVTName } from '@/lib/utils/url';
	import { fade } from 'svelte/transition';
	import EmojiString from './EmojiString.svelte';

	interface Props {
		article: ArticleWithTasks;
		displayMode?: 'thumbnail' | 'title';
		thumbnailOnly?: boolean;
		withBackground?: boolean;
		layoutKey?: string;
		animate?: boolean;
		onClick: (article: ArticleWithTasks) => void;
		onHoverEnter: (article: ArticleWithTasks) => void;
		onHoverLeave: () => void;
	}

	let {
		article,
		displayMode = 'thumbnail',
		thumbnailOnly = false,
		withBackground = true,
		layoutKey,
		animate = true,
		onClick,
		onHoverEnter,
		onHoverLeave
	}: Props = $props();

	console.log(article);

	let isRowMode = $derived(layoutKey === 'row');

	const title = $derived(
		(
			(article.persistedTasks?.find((t) => t.name?.toLocaleLowerCase() === 'title')?.data as
				| string
				| undefined) ?? ''
		).slice(0, 200)
	);

	const categories = $derived(
		(article.persistedTasks?.find((t) => t.id === 'category')?.data as string[] | undefined) ?? []
	);
</script>

<button
	type="button"
	class="article-card {layoutKey ?? ''}"
	onclick={() => onClick(article)}
	onmouseenter={() => onHoverEnter(article)}
	onmouseleave={onHoverLeave}
	aria-label="View article"
	/* 	in:fade={{ duration: animate ? 100 : 0 }}
	out:fade={{ duration: animate ? 200 : 0 }} */
>
	{#if isRowMode}
		<div class="article-content">
			{#if article.thumbnailSrc}
				<div class="article-thumbnail-container">
					<img
						src={article.thumbnailSrc}
						alt="Article"
						class="article-thumbnail"
						style={`view-transition-name: vt-main-image-${toVTName(article.url ?? '')}`}
					/>
				</div>
			{/if}
			<div class="article-title">
				<span>{title}</span>
			</div>
		</div>
	{:else}
		<div class="article-content">
			<div class="article-item-info">
				{#if displayMode === 'thumbnail' && article.thumbnailSrc}
					<div class="article-thumbnail-container">
						<img
							src={article.thumbnailSrc}
							alt="Article"
							class="article-thumbnail"
							style={`view-transition-name: vt-main-image-${toVTName(article.url ?? '')}`}
						/>
					</div>
				{/if}
				{#if !thumbnailOnly || !article.thumbnailSrc}
					<div class="article-title">
						<span>{title}</span>
					</div>
					{#if categories.length > 0}
						<div class="article-categories">
							{#each categories as category, categoryIndex (`${category}-${categoryIndex}`)}
								<span class="article-category-pill"><EmojiString value={category} /></span>
							{/each}
						</div>
					{/if}
				{/if}
			</div>
		</div>
	{/if}
</button>

<style>
	.article-card {
		all: unset;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		transition: transform 0.15s;
		font-size: 1rem;
		border-radius: var(--radius-md);
		box-sizing: border-box;
		/* min-height: 120px; */
		width: 100%;
		min-width: 0;
		max-width: 100%;
	}

	.article-card.grid-3 {
		background-image: linear-gradient(
			180deg,
			color-mix(in srgb, var(--bg-color) 20%, transparent),
			rgba(0, 0, 0),
			rgba(0, 0, 0)
		);
		padding: 18px;
	}

	.article-card.row {
		padding: 0 1rem;
	}

	.article-card.row .article-thumbnail {
		width: 60px;
		opacity: 1;
	}

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

	.article-title {
		flex: 1;
		min-width: 0;
		padding: 1rem 0;
	}

	.article-card:hover {
		font-weight: bold;
	}

	.no-background {
		background: transparent;
	}

	.article-thumbnail-container {
		flex: 0 0 30%;
		position: relative;
		display: inline-flex;
		width: 100%;
	}

	.article-thumbnail {
		display: block;
		border-radius: var(--radius-sm);
		width: 100%;
		aspect-ratio: 16 / 10;
		object-fit: cover;
		opacity: 0.5;
	}

	.thumbnail-only .article-thumbnail-container {
		flex: 1;
	}

	.article-thumbnail-raw {
		display: -webkit-box;
		justify-content: center;
		align-items: center;
		border-radius: var(--radius-sm);
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

	.article-categories {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}

	.article-category-pill {
		border-radius: var(--radius-lg);
		font-size: 0.8rem;
		font-weight: bold;
		text-transform: capitalize;
		background: rgba(var(--primary-color), 0.2);
		color: rgba(255, 255, 255, 0.8);
	}

	.row .article-content {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.row .article-thumbnail-container {
		flex: 0 0 40px;
	}

	.row .article-thumbnail {
		aspect-ratio: 1;
		object-fit: cover;
		border-radius: var(--radius-md);
		opacity: 0.5;
	}

	.row .article-title {
		flex: 1;
		padding: 0 1rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
