<script lang="ts">
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import { goto } from '$app/navigation';
	import { articleState } from '@/stores/articleStore.svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import Image from '@/components/Image.svelte';
	import RevealText from '@/components/RevealText.svelte';
	import YouTubePlayer from '@/components/youtube/YouTubePlayer.svelte';
	import ArticleCategoryEditor from '@/components/ArticleCategoryEditor.svelte';
	import ArticleToolbar from '@/components/ArticleToolbar.svelte';
	import AnalysisPanel from '@/components/AnalysisPanel.svelte';
	import ProfileThumb from '@/components/ProfileThumb.svelte';
	import { youTubeVideoId } from '@/runners/articleSources';
	import FullContentModal from './FullContentModal.svelte';
	import { readRawContent } from '@/lib/utils/rawContent';
	import { downloadFavicon } from '@/lib/urlRouter/faviconDownloader';
	import { createHotkey } from '@tanstack/svelte-hotkeys';
	import Icon from '@/components/Icon.svelte';

	const article = $derived(articleState.currentArticle);

	/**
	 * Domain thumb for the top title row. Moved out of the removed Topbar: the
	 * Google favicon URL paints immediately, then the locally downloaded one
	 * replaces it. Raw articles have no domain, so they show a placeholder.
	 */
	let faviconSrc = $state<string | null>(null);

	$effect(() => {
		const domain = viewState.domainUrl;
		if (!domain || viewState.isRawMode) {
			faviconSrc = null;
			return;
		}

		faviconSrc = `https://www.google.com/s2/favicons?sz=64&domain=${domain}`;
		void downloadFavicon(domain).then((result) => {
			// A slower download for a previously open domain must not repaint
			// the thumb after the article (and its domain) changed.
			if (viewState.domainUrl === domain && result) faviconSrc = result.src;
		});
	});

	/**
	 * The article title, gated on `status === 'done'` — the uniform "the
	 * loader finished" signal for both a fresh run (set where `loaded` rises)
	 * and a plain open of a cached article (`loaded` stays false there). It
	 * reveals in sync with its own shine animation.
	 */
	const readyTitle = $derived(article.status === 'done' ? article.title : null);

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
	<!-- Always mounted: until the title is ready the thumb box and RevealText
	 * render empty, but the row keeps its reserved height so grid row 1 (and
	 * everything in rows below it) never shifts when the title lands. -->
	<div class="article-header">
		<span class="title-thumb">
			{#if faviconSrc}
				<img class="domain-thumb" src={faviconSrc} alt="" />
			{:else}
				<Icon name="ClipboardType" size={30} />
			{/if}
		</span>
		<RevealText text={readyTitle} reveal={viewState.loaded} fontSize="0.95rem" dot />
	</div>

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
			{#if article.profilePictureSrc || article.profile}
				<button
					type="button"
					class="profile-link"
					onclick={goToProfile}
					aria-label={article.profile ? `View ${article.profile}` : 'View profile'}
				>
					{#if article.profilePictureSrc}
						<ProfileThumb
							src={article.profilePictureSrc}
							alt={article.profile ?? ''}
							size={50}
							decorative
						/>
					{/if}
					{#if article.profile}
						<span class="profile-name">{article.profile}</span>
					{/if}
				</button>
			{/if}
		</div>
		<div class="category-editor_container">
			{#if article.url && article.status !== 'running'}
				<ArticleCategoryEditor articleUrl={article.url} value={article.categories} />
			{/if}
			<ArticleToolbar onOpenFullContent={openFullContent} />
		</div>
	</div>

	{#if article.status === 'error' && article.error}
		<div class="error-notice" role="alert">
			<span class="error-message">{article.error}</span>
			<span class="error-hint">Click the refresh icon to retry.</span>
		</div>
	{/if}

	<div class="article-analysis">
		<AnalysisPanel />
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
		padding-top: 2rem;
		display: grid;
		grid-template-columns: 220px minmax(0, 1fr);
		column-gap: 1.5rem;
		row-gap: 1rem;
		align-items: start;
	}

	/* Fixed 300px track holding the article thumbnail or the YouTube player. */
	.media-col {
		grid-column: 1;
		width: 200px;
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

	/* Full-width title header spanning both columns, above media + meta:
	 * domain thumb on the left, article title revealed beside it.
	 * min-height reserves the row before `readyTitle` exists, so processing
	 * finishing cannot push the rest of the body down. */
	.article-header {
		grid-column: 1 / -1;
		grid-row: 1;
		width: 100%;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		min-height: 6rem;
	}

	.title-thumb {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 30px;
		height: 30px;
	}

	.domain-thumb {
		width: 30px;
		height: 30px;
		border-radius: var(--radius-sm);
	}

	/* Why the article is empty after a failed run: the stored error message
	 * plus the one action that retries it (the refresh icon above). */
	.error-notice {
		grid-column: 1 / -1;
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding: 0.75rem 1rem;
		border-radius: var(--radius-sm);
		background-color: var(--hover-bg);
		font-family: var(--font-secondary);
		font-size: 0.85rem;
		line-height: 1.3;
	}

	.error-message {
		color: var(--gray-100);
		word-break: break-word;
	}

	.error-hint {
		color: var(--gray-100);
		opacity: 0.7;
	}

	.category-editor_container {
		display: flex;
		align-items: center;
		gap: 2rem;
		padding: 1rem 0;
	}

	.category-editor_container :global(.article-category-editor) {
		min-width: 0;
	}

	.title-row {
		display: flex;
		align-items: center;
		gap: 1rem;
		width: 100%;
	}

	/* Single click target for the whole profile row: `ProfileThumb` is rendered
	 * without its own `onclick`, so it stays a plain <img> and no button nests
	 * inside this one. */
	.profile-link {
		all: unset;
		display: inline-flex;
		align-items: center;
		gap: 0.75rem;
		min-width: 0;
		max-width: 100%;
		cursor: pointer;
	}

	.profile-name {
		overflow: hidden;
		min-width: 0;
		font-family: var(--font-secondary);
		font-size: 0.85rem;
		line-height: 1.1;
		font-weight: bold;
		color: var(--gray-100);
		white-space: nowrap;
		text-overflow: ellipsis;
		transition: color 0.1s;
	}

	.profile-link:hover .profile-name {
		color: var(--primary-color);
	}

	.article-analysis {
		width: 100%;
	}

	.article-content {
		width: 100%;
		padding-top: 1rem;
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
