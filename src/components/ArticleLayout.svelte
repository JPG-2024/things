<script lang="ts">
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import { goto } from '$app/navigation';
	import { articleState } from '@/stores/articleStore.svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import Image from '@/components/Image.svelte';
	import YouTubePlayer from '@/components/youtube/YouTubePlayer.svelte';
	import ArticleCategoryEditor from '@/components/ArticleCategoryEditor.svelte';
	import AnalysisPanel from '@/components/AnalysisPanel.svelte';
	import AskComponent from '@/components/AskComponent.svelte';
	import ProfileThumb from '@/components/ProfileThumb.svelte';
	import { youTubeVideoId } from '@/runners/articleSources';
	import Icon from './Icon.svelte';
	import FullContentModal from './FullContentModal.svelte';
	import { readRawContent } from '@/lib/utils/rawContent';
	import { createHotkey } from '@tanstack/svelte-hotkeys';

	const article = $derived(articleState.currentArticle);

	const isYouTube = $derived(Boolean(article.url && youTubeVideoId(article.url)));
	const videoId = $derived(article.url ? youTubeVideoId(article.url) : null);
	/** Resolved src (dev `/@fs`, prod asset src); `thumbnail` alone is a raw media filename. */
	const thumbnailSrc = $derived(article.thumbnailSrc);

	// Svelte only plays a *local* intro (`transition:`/`in:`) when the enclosing
	// {#if} block effect has already executed at least once — `REACTION_RAN` is
	// set after the block's fn returns, so a branch created during that first
	// run (the element present at initial render) is skipped silently. `hasMedia`
	// is already true on the first render for cached articles: `urlRouter`
	// writes `articleState.begin(url)` synchronously before `goto()` runs.
	// Flip the flag one tick after mount so `{#if hasMedia}` re-runs and the
	// media column — and its fly-in — are always created by a later run.
	let mediaIntroReady = $state(false);
	onMount(() => {
		mediaIntroReady = true;
	});

	/**
	 * Whether the left cell has something to render. Without it the fixed
	 * 300px track would sit empty, so the title column takes both columns.
	 */
	const hasMedia = $derived(
		mediaIntroReady && (isYouTube ? Boolean(videoId) : Boolean(thumbnailSrc))
	);

	// Raw content is read lazily: the body only lives in memory while the
	// full-content modal is open, and the reference is dropped on close.
	let rawContent = $state<string | null>(null);
	let contentLoading = $state(false);
	let showFullContentModal = $state(false);
	/** Url the current body (or the in-flight read) belongs to. */
	let contentUrl = $state<string | null>(null);

	/** Bumped to discard a read that resolves after a close or a navigation. */
	let contentRequestId = 0;

	/**
	 * Reads the body of the article on demand, straight from its saved file
	 * (`raw_content/<sha256(url)>.txt`). It is never kept in the store.
	 */
	async function loadContent(): Promise<void> {
		const url = article.url;
		if (!url || contentLoading) return;
		if (rawContent !== null && contentUrl === url) return;

		const requestId = ++contentRequestId;
		contentUrl = url;
		contentLoading = true;
		const content = await readRawContent(url);

		if (requestId !== contentRequestId) return;
		rawContent = content;
		contentLoading = false;
	}

	function openFullContent(): void {
		if (!article.url) return;
		showFullContentModal = true;
		void loadContent();
	}

	function closeFullContent(): void {
		showFullContentModal = false;
		// The body can be megabytes: release it as soon as the modal closes.
		contentRequestId += 1;
		rawContent = null;
		contentUrl = null;
		contentLoading = false;
	}

	// The route reuses this component between articles, so an open modal (or
	// an in-flight read) must never follow the article into the next page.
	$effect(() => {
		const url = article.url;
		if (contentUrl === null || contentUrl === url) return;
		closeFullContent();
	});

	createHotkey('F', openFullContent, () => ({
		enabled: !!article.url && !showFullContentModal,
		ignoreInputs: true,
		stopPropagation: true,
		preventDefault: true
	}));

	function goToProfile() {
		if (!article.profile) return;
		viewState.currentProfileId = article.profile;
		goto(`/profile/${article.profile}`);
	}
</script>

<div class="article-layout">
	{#if hasMedia}
		<div class="media-col" transition:fade={{ duration: 200 }}>
			{#if isYouTube && videoId}
				<YouTubePlayer
					data={{
						mediaDirectory: '',
						thumbnailImage: '',
						thumbnailImageSrc: thumbnailSrc ?? '',
						videoId,
						url: article.url
					}}
				/>
			{:else if thumbnailSrc}
				<Image src={thumbnailSrc} alt={article.title ?? 'Article'} transitionKey={article.url} />
			{/if}
		</div>
	{/if}

	<div class="meta-col" class:span-all={!hasMedia}>
		<div class="title-row">
			{#if article.profilePictureSrc}
				<ProfileThumb src={article.profilePictureSrc} size={50} onclick={goToProfile} />
			{/if}
			{#if article.title}
				<div class="article-title">{article.title}</div>
			{/if}
		</div>
		<div class="category-editor_container">
			{#if article.url}
				<button
					class="full-content-button"
					onclick={openFullContent}
					aria-label="View full content"
					title="View full content (F)"
				>
					<Icon name="Code" size={24} color="var(--primary-color)" />
				</button>
			{/if}
			{#if article.url && article.status !== 'running'}
				<ArticleCategoryEditor articleUrl={article.url} value={article.categories} />
			{/if}
		</div>
	</div>

	<div class="article-analysis">
		<AnalysisPanel />
	</div>

	<div class="article-content">
		<AskComponent url={article.url} />
	</div>
</div>

<FullContentModal
	show={showFullContentModal}
	content={rawContent}
	loading={contentLoading}
	title={article.title}
	onClose={closeFullContent}
/>

<style>
	.article-layout {
		width: 100%;
		padding: 3rem;
		display: grid;
		grid-template-columns: 300px minmax(0, 1fr);
		column-gap: 1.5rem;
		row-gap: 1.5rem;
		align-items: start;
	}

	/* Fixed 300px track holding the article thumbnail or the YouTube player. */
	.media-col {
		grid-column: 1;
		width: 300px;
		min-width: 0;
	}

	.meta-col {
		grid-column: 2;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	/* No thumbnail on this article: the title takes the whole row. */
	.meta-col.span-all {
		grid-column: 1 / -1;
	}

	.article-analysis,
	.article-content {
		grid-column: 1 / -1;
	}

	.category-editor_container {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 1rem 0;
	}

	.category-editor_container :global(.article-category-editor) {
		flex: 1 1 auto;
		min-width: 0;
	}

	.title-row {
		display: flex;
		align-items: center;
		gap: 1rem;
		width: 100%;
	}

	.article-title {
		font-family: var(--font-secondary);
		font-size: 1.1rem;
		margin-right: auto;
		width: 100%;
		padding: 1rem 0;
		font-variant: all-small-caps;
	}

	.article-title::after {
		content: '.';
	}

	.article-analysis {
		width: 100%;
	}

	.article-content {
		width: 100%;
		padding-top: 1rem;
	}

	.full-content-button {
		background: none;
		border: none;
		padding: 0.5rem;
		cursor: pointer;
		border-radius: var(--radius-sm);
		transition: background-color 0.2s;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.full-content-button:hover {
		background-color: var(--hover-bg);
	}

	@media (max-width: 760px) {
		.article-layout {
			grid-template-columns: minmax(0, 1fr);
		}

		.media-col {
			grid-column: 1;
			width: min(300px, 100%);
		}

		.meta-col {
			grid-column: 1;
		}
	}
</style>
