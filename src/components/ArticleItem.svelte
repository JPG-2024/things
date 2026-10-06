<script lang="ts">
	import type { ArticleWithTasks } from '@/stores/webStore';
	import { viewState } from '@/stores/viewStore.svelte';
	import type { ArticleContentMode, LayoutKey, RawSearchMatch } from '@/stores/viewStore.svelte';
	import { toVTName } from '@/lib/utils/url';
	import { goto } from '$app/navigation';
	import { fade } from 'svelte/transition';
	import CategoryItem from './CategoryItem.svelte';
	import Keywords from './Keywords.svelte';

	interface Props {
		article: ArticleWithTasks;
		contentMode?: ArticleContentMode;
		thumbnailOnly?: boolean;
		thumbnailWidth?: number;
		thumbnailHeight?: number;
		layoutKey?: LayoutKey;
		animate?: boolean;
		marked?: boolean;
		matchSnippet?: RawSearchMatch;
		onClick: (article: ArticleWithTasks) => void;
		onHoverEnter: (article: ArticleWithTasks) => void;
		onHoverLeave: () => void;
	}

	let {
		article,
		contentMode = undefined,
		thumbnailOnly = false,
		thumbnailWidth = undefined,
		thumbnailHeight = undefined,
		layoutKey,
		animate = true,
		marked = false,
		matchSnippet,
		onClick,
		onHoverEnter,
		onHoverLeave
	}: Props = $props();

	let isRowMode = $derived(layoutKey === 'row');
	let isFixedThumb = $derived(thumbnailWidth !== undefined && thumbnailHeight !== undefined);

	// Category previews force thumbnail-only; otherwise the grid-wide preference
	// (cycled from the masonry toolbar) decides what is rendered.
	let mode = $derived(
		contentMode ?? (thumbnailOnly ? 'thumbnail' : viewState.masonryArticlesContentMode)
	);
	let showThumbnail = $derived(mode !== 'title');
	let showText = $derived(mode !== 'thumbnail' || !article.thumbnailSrc);

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

	function categoryLabel(value: string): string {
		return viewState.categories.find((category) => category.id === value)?.name ?? value;
	}

	function shuffle<T>(list: T[]): T[] {
		const copy = [...list];
		for (let i = copy.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[copy[i], copy[j]] = [copy[j], copy[i]];
		}
		return copy;
	}

	const someTopics = $derived.by(() => {
		const task = article.persistedTasks?.find((t) => t.id === 'analysis');
		const data = task?.data as unknown;
		if (Array.isArray(data)) {
			return data.filter((q): q is string => typeof q === 'string');
		}
		if (!data || typeof data !== 'object') return [];
		const topics = (data as Record<string, unknown>).topics;
		if (Array.isArray(topics)) {
			return topics.filter((q): q is string => typeof q === 'string');
		}
		return [];
	});

	// shuffled picks are memoized per article+question-count so unrelated article
	// object updates (store refreshes) don't re-shuffle and re-wrap the pills
	let randomTopicsKey = '';
	let randomTopicsMemo: string[] = [];
	const randomTopics = $derived.by(() => {
		const key = `${article.url ?? ''}:${someTopics.length}`;
		if (key !== randomTopicsKey) {
			randomTopicsKey = key;
			randomTopicsMemo = shuffle(someTopics).slice(0, 2);
		}
		return randomTopicsMemo;
	});
</script>

{#snippet categoryPills()}
	{#if categories.length > 0}
		<div class="article-categories">
			{#each categories as category, categoryIndex (`${category}-${categoryIndex}`)}
				<span class="article-category-pill"><CategoryItem value={categoryLabel(category)} /></span>
			{/each}
		</div>
	{/if}
{/snippet}

<button
	type="button"
	class="article-card {layoutKey ?? ''}"
	class:marked-for-delete={marked}
	class:fixed-thumb-card={isFixedThumb}
	style={isFixedThumb
		? `--fixed-thumb-w: ${thumbnailWidth}px; --fixed-thumb-h: ${thumbnailHeight}px;`
		: undefined}
	onclick={() => onClick(article)}
	onmouseenter={() => onHoverEnter(article)}
	onmouseleave={onHoverLeave}
	aria-label="View article"
>
	<!-- 	{#if article.profilePictureSrc}
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
	{/if} -->
	{#if isRowMode}
		<div class="article-content">
			{#if showThumbnail && article.thumbnailSrc}
				<div class="article-thumbnail-container">
					<img
						src={article.thumbnailSrc}
						alt="Article"
						class="article-thumbnail"
						style={`view-transition-name: vt-main-image-${toVTName(article.url ?? '')}`}
					/>
				</div>
			{/if}
			{#if showText}
				{#if matchSnippet}
					<div class="article-match-snippet">
						<span class="snippet-context">{matchSnippet.before}</span><mark
							>{matchSnippet.matchText}</mark
						><span class="snippet-context">{matchSnippet.after}</span>
					</div>
				{:else}
					<div class="article-title">
						<span>{article.title}</span>
					</div>
					{@render categoryPills()}
				{/if}
			{/if}
		</div>
	{:else if layoutKey === 'grid-3'}
		<div class="article-content" class:no-thumb={!(showThumbnail && article.thumbnailSrc)}>
			{#if showThumbnail && article.thumbnailSrc}
				<div class="article-thumbnail-container">
					<img
						src={article.thumbnailSrc}
						alt="Article"
						class="article-thumbnail"
						style={`view-transition-name: vt-main-image-${toVTName(article.url ?? '')}`}
					/>
				</div>
			{/if}
			{#if showText}
				{#if matchSnippet}
					<div class="article-match-snippet">
						<span class="snippet-context">{matchSnippet.before}</span><mark
							>{matchSnippet.matchText}</mark
						><span class="snippet-context">{matchSnippet.after}</span>
					</div>
				{:else}
					<div class="article-title">
						<span>{article.title}</span>
					</div>
					{#if randomTopics.length > 0}
						<div class="article-item__keywords">
							<Keywords keywords={randomTopics} />
						</div>
					{/if}
					{@render categoryPills()}
				{/if}
			{/if}
		</div>
	{:else}
		<div class="article-content">
			<div class="article-item-info">
				{#if isFixedThumb}
					<div class="article-thumbnail-container fixed-thumb">
						{#if showThumbnail && article.thumbnailSrc}
							<img
								src={article.thumbnailSrc}
								alt="Article"
								class="article-thumbnail"
								style={`view-transition-name: vt-main-image-${toVTName(article.url ?? '')}`}
							/>
						{:else}
							<div class="article-thumbnail-fallback">
								{article.title?.slice(0, 80) ?? ''}
							</div>
						{/if}
					</div>
				{:else if showThumbnail && article.thumbnailSrc}
					<div class="article-thumbnail-container">
						<img
							src={article.thumbnailSrc}
							alt="Article"
							class="article-thumbnail"
							style={`view-transition-name: vt-main-image-${toVTName(article.url ?? '')}`}
						/>
					</div>
				{/if}
				{#if showText && !isFixedThumb}
					{#if matchSnippet}
						<div class="article-match-snippet">
							<span class="snippet-context">{matchSnippet.before}</span><mark
								>{matchSnippet.matchText}</mark
							><span class="snippet-context">{matchSnippet.after}</span>
						</div>
					{:else}
						<div class="article-title">
							<span>{article.title}</span>
						</div>
						{@render categoryPills()}
						{#if randomTopics.length > 0}
							<Keywords keywords={randomTopics} />
						{/if}
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
		position: relative;
		/* border-top: 1px solid var(--bg-color); */
	}

	.article-item__keywords {
		padding: 0.6rem 0;
	}

	.article-card {
		--keywords-font-size: 0.7rem;
		--pill-font-size: 0.6rem;
	}

	.article-profile-avatar {
		position: absolute;
		top: 8px;
		left: 8px;
		width: 25px;
		height: 25px;
		cursor: pointer;
		z-index: 1;
		overflow: hidden;
		border-radius: var(--radius-sm);
	}

	.article-profile-avatar img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
		border-radius: var(--radius-sm);
	}

	.article-card.grid-3 {
		background-image: linear-gradient(
			145deg,
			color-mix(in srgb, var(--primary-color) 15%, transparent),
			color-mix(in srgb, var(--bg-color) 15%, transparent),
			rgba(0, 0, 0),
			rgba(0, 0, 0)
		);
		padding: 14px 16px;
	}

	.grid-3 .article-content {
		display: grid;
		grid-template-columns: minmax(0, 50%) minmax(0, 1fr);
		column-gap: 0.75rem;
		row-gap: 0.6rem;
		align-items: start;
		min-width: 0;
	}

	.grid-3 .article-content.no-thumb {
		grid-template-columns: minmax(0, 1fr);
	}

	.grid-3 .article-thumbnail-container {
		grid-column: 1;
		grid-row: 1;
		width: 100%;
		min-width: 0;
	}

	/* thumbnail-only mode: fill the card */
	.grid-3 .article-thumbnail-container:only-child {
		grid-column: 1 / -1;
	}

	.grid-3 .article-title {
		grid-column: 2;
		grid-row: 1;
		padding: 0;
		font-size: 0.9rem;
		font-weight: bold;
		min-width: 0;
	}

	.grid-3 .article-match-snippet {
		grid-column: 2;
		grid-row: 1;
		min-width: 0;
	}

	.grid-3 .article-item__keywords {
		grid-column: 1 / -1;
		grid-row: 2;
		padding: 0.4rem 0;
		min-width: 0;
	}

	.grid-3 .article-categories {
		grid-column: 2;
		grid-row: 3;
		min-width: 0;
	}

	.grid-3 .article-thumbnail {
		max-width: 100%;
		min-width: 0;
	}

	/* title-only mode: collapse the empty left column */
	.grid-3 .article-content.no-thumb .article-title,
	.grid-3 .article-content.no-thumb .article-match-snippet,
	.grid-3 .article-content.no-thumb .article-categories {
		grid-column: 1 / -1;
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

	/* 	.article-title::after {
		content: '.';
	} */

	.article-card:hover .article-thumbnail {
		opacity: 1;
	}

	.article-card.marked-for-delete {
		--bg-color: red;
		border-top-color: red;
		background: rgba(255, 0, 0, 0.18);
	}

	.article-card.marked-for-delete.grid-3 {
		background-image: linear-gradient(
			180deg,
			color-mix(in srgb, red 20%, transparent),
			rgba(0, 0, 0),
			rgba(0, 0, 0)
		);
		background-color: rgba(255, 0, 0, 0.18);
	}

	.article-card.marked-for-delete.row {
		background: rgba(255, 0, 0, 0.25);
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
		aspect-ratio: 16 / 9;
		object-fit: cover;
		opacity: 0.8;
		transition: opacity 0.2s ease;
	}

	.thumbnail-only .article-thumbnail-container {
		flex: 1;
	}

	.article-card.fixed-thumb-card {
		flex: 0 0 auto;
		width: var(--fixed-thumb-w);
		min-width: var(--fixed-thumb-w);
		max-width: var(--fixed-thumb-w);
		padding: 0;
	}

	.article-card.fixed-thumb-card .fixed-thumb {
		flex: none;
		width: 100%;
		height: var(--fixed-thumb-h);
	}

	.article-card.fixed-thumb-card .fixed-thumb .article-thumbnail {
		width: 100%;
		height: 100%;
		aspect-ratio: auto;
		border-radius: var(--radius-sm);
	}

	.article-thumbnail-fallback {
		display: -webkit-box;
		justify-content: center;
		align-items: center;
		width: 100%;
		height: 100%;
		padding: 0.4rem;
		background: rgba(255, 255, 255, 0.05);
		color: rgba(255, 255, 255, 0.75);
		font-size: 0.7rem;
		line-height: 1.15;
		text-align: left;
		overflow: hidden;
		border-radius: var(--radius-sm);
		-webkit-line-clamp: 4;
		-webkit-box-orient: vertical;
		line-clamp: 4;
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
		justify-content: flex-end;
	}

	.article-category-pill {
		border-radius: var(--radius-lg);
		font-size: 0.8rem;
		font-weight: bold;
		text-transform: capitalize;
		background: rgba(var(--primary-color), 0.2);
		color: var(--bg-color);
	}

	.row .article-content {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.row .article-thumbnail-container {
		flex: 0 0 80px;
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

	.article-match-snippet {
		font-size: 0.93rem;
		opacity: 0.95;
		padding: 0.25rem 0;
		font-style: italic;
		line-height: 1.4;
	}

	.article-match-snippet mark {
		background: color-mix(in srgb, var(--bg-color) 40%, transparent);
		color: inherit;
		border-radius: 2px;
		padding: 5px 0;
	}

	.snippet-context {
		opacity: 0.6;
	}
</style>
