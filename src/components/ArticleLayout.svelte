<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { articleState } from '@/stores/articleStore.svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import Image from '@/components/Image.svelte';
	import YouTubePlayer from '@/components/youtube/YouTubePlayer.svelte';
	import CategoryEditor from '@/components/CategoryEditor.svelte';
	import AnalysisPanel from '@/components/AnalysisPanel.svelte';
	import AskComponent from '@/components/AskComponent.svelte';
	import ProfileThumb from '@/components/ProfileThumb.svelte';
	import { youTubeVideoId } from '@/runners/articleSources';
	import Icon from './Icon.svelte';
	import MarkdownRenderer from './MarkdownRenderer.svelte';
	import FullContentModal from './FullContentModal.svelte';
	import { readRawContent } from '@/lib/utils/rawContent';
	import { createHotkey } from '@tanstack/svelte-hotkeys';

	const article = $derived(articleState.currentArticle);

	const isYouTube = $derived(Boolean(article.url && youTubeVideoId(article.url)));
	const videoId = $derived(article.url ? youTubeVideoId(article.url) : null);
	/** Resolved src (dev `/@fs`, prod asset src); `thumbnail` alone is a raw media filename. */
	const thumbnailSrc = $derived(article.thumbnailSrc);

	// Svelte skips intro transitions for elements present during a component's
	// initial render. Cached articles can already be painted by the time this
	// page mounts (the urlRouter/goto race), which swallows the thumbnail's
	// fly-in. Mount it one tick later so the insertion always animates.
	let thumbnailIntroReady = $state(false);
	onMount(() => {
		thumbnailIntroReady = true;
	});

	// Raw content state for inline display
	let rawContent = $state<string | null>(null);
	let contentLoading = $state(false);
	let showFullContentModal = $state(false);

	// Load raw content reactively
	$effect(() => {
		const url = article.url;
		const status = article.status;
		
		if (!url) {
			rawContent = null;
			contentLoading = false;
			return;
		}

		// Load when article is done or idle
		if (status === 'done' || status === 'idle') {
			contentLoading = true;
			const targetUrl = url;
			readRawContent(url).then(content => {
				if (article.url === targetUrl) {
					rawContent = content;
					contentLoading = false;
				}
			});
		} else {
			rawContent = null;
			contentLoading = false;
		}
	});

	createHotkey(
		'F',
		() => {
			if (article.url && !showFullContentModal) {
				showFullContentModal = true;
			}
		},
		() => ({
			enabled: !!article.url && !showFullContentModal,
			ignoreInputs: true,
			stopPropagation: true,
			preventDefault: true
		})
	);

	function goToProfile() {
		if (!article.profile) return;
		viewState.currentProfileId = article.profile;
		goto(`/profile/${article.profile}`);
	}
</script>

<div class="article-layout">
	<div class="article-header-row">
		{#if thumbnailSrc && thumbnailIntroReady && !isYouTube}
			<div class="header-col thumbnail-col">
				<Image src={thumbnailSrc} alt={article.title ?? 'Article'} transitionKey={article.url} />
			</div>
		{/if}

		<div class="header-col category-col">
			<div class="title-row">
				{#if article.profilePictureSrc}
					<ProfileThumb src={article.profilePictureSrc} size={50} onclick={goToProfile} />
				{/if}
				{#if article.title}
					<div class="article-title">{article.title}</div>
				{/if}
				{#if article.url}
					<button 
						class="full-content-button"
						onclick={() => showFullContentModal = true}
						aria-label="View full content"
						title="View full content (F)"
					>
						<Icon name="Maximize2" size={50} color="var(--primary-color)" />
					</button>
				{/if}
			</div>
			<div class="category-editor_container">
				{#if article.url && article.status !== 'running'}
					<CategoryEditor articleUrl={article.url} value={article.categories} />
				{/if}
			</div>
		</div>
	</div>

	<div class="article-analysis">
		<AnalysisPanel />
	</div>

	{#if isYouTube && videoId}
		<div class="article-player">
			<YouTubePlayer
				data={{
					mediaDirectory: '',
					thumbnailImage: '',
					thumbnailImageSrc: thumbnailSrc ?? '',
					videoId,
					url: article.url
				}}
			/>
		</div>
	{/if}

	{#if contentLoading}
		<div class="article-raw-content">
			<div class="content-loading">Loading content...</div>
		</div>
	{:else if rawContent}
		<div class="article-raw-content">
			<MarkdownRenderer content={rawContent} />
		</div>
	{/if}

	<div class="article-content">
		<AskComponent url={article.url} />
	</div>
</div>

<FullContentModal
	show={showFullContentModal}
	content={rawContent}
	title={article.title}
	onClose={() => showFullContentModal = false}
/>

<style>
	.article-layout {
		width: 100%;
		padding: 3rem;
	}

	.category-editor_container {
		padding: 1rem 0;
	}

	.title-row {
		display: flex;
		align-items: center;
		gap: 1rem;
		width: 100%;
	}

	.article-title {
		font-family: var(--font-secondary);
		font-size: 1.2rem;
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

	.article-player {
		width: 100%;
		max-width: 32rem;
	}

	.article-header-row {
		display: flex;
		align-items: flex-start;
		gap: 1.5rem;
		width: 100%;
		padding-bottom: 1rem;
		max-height: 200px;
	}

	.header-col {
		min-width: 0;
		height: 500px;
	}

	.thumbnail-col {
		flex: 0 0 50%;
		max-width: 320px;
	}

	.category-col {
		flex: 1;
		display: flex;
		flex-direction: column;
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

	.article-raw-content {
		width: 100%;
		padding: 1.5rem 0;
		border-top: 1px solid var(--border-color);
		margin-top: 1rem;
	}

	.content-loading {
		color: var(--text-muted);
		font-style: italic;
	}
</style>
