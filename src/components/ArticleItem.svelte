<script lang="ts">
	import type { ArticleWithTasks } from '@/stores/webStore';
	import { toVTName } from '@/lib/utils/url';
	import { goto } from '$app/navigation';
	import { fade } from 'svelte/transition';
	import EmojiString from './EmojiString.svelte';
	import Keywords from './Keywords.svelte';
	import type { LayoutKey } from './MasonryGrid.svelte';

	interface Props {
		article: ArticleWithTasks;
		displayMode?: 'thumbnail' | 'title';
		thumbnailOnly?: boolean;
		withBackground?: boolean;
		layoutKey?: LayoutKey;
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

	function shuffle<T>(list: T[]): T[] {
		const copy = [...list];
		for (let i = copy.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[copy[i], copy[j]] = [copy[j], copy[i]];
		}
		return copy;
	}

	const allQuestions = $derived.by(() => {
		const task = article.persistedTasks?.find((t) => t.id === 'questions');
		const data = task?.data as
			| { chunks?: Array<{ data?: unknown }>; finalResponse?: unknown }
			| string[]
			| undefined;
		if (Array.isArray(data)) {
			return data.filter((q): q is string => typeof q === 'string');
		}
		if (!data) return [];
		if (Array.isArray(data.finalResponse)) {
			return data.finalResponse.filter((q): q is string => typeof q === 'string');
		}
		if (typeof data.finalResponse === 'string') {
			return [data.finalResponse];
		}
		if (!Array.isArray(data.chunks)) return [];
		return data.chunks
			.flatMap((chunk) => (Array.isArray(chunk.data) ? chunk.data : []))
			.filter((q): q is string => typeof q === 'string' && q.trim().length > 0);
	});

	// shuffled picks are memoized per article+question-count so unrelated article
	// object updates (store refreshes) don't re-shuffle and re-wrap the pills
	let randomQuestionsKey = '';
	let randomQuestionsMemo: string[] = [];
	const randomQuestions = $derived.by(() => {
		const key = `${article.url ?? ''}:${allQuestions.length}`;
		if (key !== randomQuestionsKey) {
			randomQuestionsKey = key;
			randomQuestionsMemo = shuffle(allQuestions).slice(0, 2);
		}
		return randomQuestionsMemo;
	});
</script>

{#snippet categoryPills()}
	{#if categories.length > 0}
		<div class="article-categories">
			{#each categories as category, categoryIndex (`${category}-${categoryIndex}`)}
				<span class="article-category-pill"><EmojiString value={category} /></span>
			{/each}
		</div>
	{/if}
{/snippet}

<button
	type="button"
	class="article-card {layoutKey ?? ''}"
	onclick={() => onClick(article)}
	onmouseenter={() => onHoverEnter(article)}
	onmouseleave={onHoverLeave}
	aria-label="View article"
>
	{#if article.profilePictureSrc}
		<span
			class="article-profile-avatar"
			role="button"
			tabindex="0"
			aria-label="Go to profile"
			onclick={(event) => {
				event.stopPropagation();
				if (article.profileId) goto(`/profile/${article.profileId}`);
			}}
			onkeydown={(event) => {
				if (event.key !== 'Enter' && event.key !== ' ') return;
				event.preventDefault();
				event.stopPropagation();
				if (article.profileId) goto(`/profile/${article.profileId}`);
			}}
		>
			<img src={article.profilePictureSrc} alt="" />
		</span>
	{/if}
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
			{@render categoryPills()}
		</div>
	{:else if layoutKey === 'grid-3'}
		<div class="article-content article-content-stacked">
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
			{@render categoryPills()}
			{#if randomQuestions.length > 0}
				<Keywords keywords={randomQuestions} />
			{/if}
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
					{@render categoryPills()}
					{#if randomQuestions.length > 0}
						<Keywords keywords={randomQuestions} />
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
		border-radius: 2px;
		box-sizing: border-box;
		/* min-height: 120px; */
		width: 100%;
		min-width: 0;
		max-width: 100%;
		position: relative;
		border-top: 1px solid var(--bg-color);
	}

	.article-profile-avatar {
		position: absolute;
		top: 5px;
		left: 5px;
		width: 20px;
		height: 20px;
		border-radius: var(--radius-sm);
		cursor: pointer;

		z-index: 1;
		overflow: hidden;
	}

	.article-profile-avatar img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.article-card.grid-3 {
		background-image: linear-gradient(
			180deg,
			color-mix(in srgb, var(--bg-color) 20%, transparent),
			rgba(0, 0, 0),
			rgba(0, 0, 0)
		);
		padding: 14px 16px;
		flex-direction: column;
		align-items: stretch;
	}

	.grid-3 .article-thumbnail-container {
		flex: none;
		width: 100%;
	}

	.grid-3 .article-title {
		padding: 0.6rem 0;
		font-size: 0.8rem;
	}

	.article-card.row {
		padding: 0 1rem;
		border: none;
	}

	.article-card.row .article-thumbnail {
		width: 60px;
		opacity: 0.8;
	}

	.article-card.row .article-title {
		font-size: 0.9rem;
	}

	.article-content {
		display: flex;
		align-items: flex-start;
		width: 100%;
		min-width: 0;
	}

	.article-content-stacked {
		flex-direction: column;
		align-items: stretch;
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

	.article-card:hover .article-thumbnail {
		opacity: 1;
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
		opacity: 0.8;
		transition: opacity 0.2s ease;
	}

	.thumbnail-only .article-thumbnail-container {
		flex: 1;
	}

	.article-thumbnail-raw {
		display: -webkit-box;
		justify-content: center;
		align-items: center;
		/* border-radius: var(--radius-sm); */
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
		border-radius: var(--radius-sm);
		opacity: 0.5;
	}

	.row .article-title {
		flex: 1;
		padding: 0 1rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.row .article-categories {
		flex: none;
		flex-wrap: nowrap;
		overflow: hidden;
		max-width: 40%;
		white-space: nowrap;
	}
</style>
