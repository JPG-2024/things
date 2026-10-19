<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { createHotkey } from '@tanstack/svelte-hotkeys';
	import Icon from '@/components/Icon.svelte';
	import ProfileTopbar from '@/components/ProfileTopbar.svelte';
	import ArticleList from '@/components/ArticleList.svelte';
	import { INITIAL_TEMPLATE_ID } from '@/runners/templateConstants';
	import {
		deleteProfileById,
		getProfile,
		type ArticleProfile,
		type ArticleWithTasks
	} from '@/stores/webStore';
	import { viewState } from '@/stores/viewStore.svelte';
	import { articleCacheStore } from '@/stores/articleCacheStore.svelte';
	import { scrapStore } from '@/stores/scrapStore.svelte';
	import { generateProfileSummary } from '@/lib/utils/inference/profileSummary';
	import { urlRouter } from '@/lib/urlRouter/urlRouter';

	let profileId = $derived(page.params.profileId);
	let profile = $state<ArticleProfile | null>(null);
	let loading = $state(true);
	let isDeleting = $state(false);

	let summaryOpen = $state(false);
	let summaryText = $state('');
	let summaryLoading = $state(false);
	let summaryError = $state<string | null>(null);
	let summaryWrapperEl: HTMLDivElement | undefined = $state();

	async function generateSummary() {
		if (summaryLoading) return;
		summaryLoading = true;
		summaryError = null;
		try {
			summaryText = await generateProfileSummary(articleCacheStore.articlesWithoutProfile);
		} catch (error) {
			summaryError = error instanceof Error ? error.message : 'Failed to generate summary';
		} finally {
			summaryLoading = false;
		}
	}

	function toggleSummary() {
		summaryOpen = !summaryOpen;
		if (summaryOpen && !summaryText && !summaryLoading) {
			generateSummary();
		}
	}

	function closeSummary() {
		summaryOpen = false;
	}

	function handleClickOutside(event: MouseEvent) {
		const target = event.target as Node;
		if (summaryOpen && summaryWrapperEl && !summaryWrapperEl.contains(target)) {
			closeSummary();
		}
	}

	createHotkey('Escape', closeSummary, () => ({
		enabled: summaryOpen,
		ignoreInputs: true
	}));

	onMount(async () => {
		loading = true;
		try {
			profile = await getProfile(profileId);
		} finally {
			loading = false;
		}
	});

	$effect(() => {
		// `page` is a global store: while navigating away, params can flip to
		// undefined before this page unmounts, which would launch a fetch with
		// a broken profileId and let it overwrite the store's current list.
		if (!profileId) return;
		void articleCacheStore.fetchArticlesWithoutProfile({
			profileId,
			templateId: viewState.showOnlyInitialArticles ? INITIAL_TEMPLATE_ID : undefined,
			includeInitial: true
		});
	});

	function handleBack() {
		goto('/');
	}

	async function handleDeleteProfile() {
		if (isDeleting) return;
		isDeleting = true;
		try {
			const result = await deleteProfileById(profileId);
			if (result.success) {
				if (viewState.activeArticleProfileId === profileId) {
					viewState.activeArticleProfileId = null;
				}
				articleCacheStore.invalidateProfiles();
				goto('/');
			}
		} finally {
			isDeleting = false;
		}
	}

	async function handleNavigateToArticle(article: ArticleWithTasks) {
		if (!article.url) return;
		viewState.currentProfileId = profileId;
		if (article.url.startsWith('raw-')) {
			goto(`/raw/${article.url}`);
			await urlRouter(article.url);
		} else {
			urlRouter(article.url);
			goto(`/youtube/${encodeURIComponent(article.url)}`);
		}
	}

	async function handleFetchMissingVideos() {
		if (scrapStore.isFetchingMissingVideos || !profileId) return;
		try {
			await scrapStore.fetchMissingProfileVideos(profileId);
		} catch (error) {
			console.error('Failed to fetch missing profile videos', error);
		}
	}
</script>

<svelte:window onclick={handleClickOutside} />

<div class="profile-page">
	<ProfileTopbar
		name={profile?.name}
		thumbSrc={profile?.profilePictureSrc}
		fallbackIcon="User"
		onBack={handleBack}
	>
		{#snippet actions()}
			<Icon
				name={scrapStore.isFetchingMissingVideos ? 'Loader2' : 'RefreshCw'}
				class={scrapStore.isFetchingMissingVideos ? 'spin' : ''}
				onClick={handleFetchMissingVideos}
				disabled={scrapStore.isFetchingMissingVideos || loading}
				ariaLabel="Fetch missing videos"
				tooltipProps={{
					content: scrapStore.parallelFetch
						? `Fetch missing videos (parallel x${scrapStore.parallelVideosAmount})`
						: `Fetch missing videos (sequential) – max ${scrapStore.maxVideos}`
				}}
			/>
			<div bind:this={summaryWrapperEl} class="summary-wrapper">
				<Icon
					name="Sparkles"
					onClick={toggleSummary}
					ariaLabel="Profile summary"
					tooltipProps={{ content: 'summary' }}
				/>
				{#if summaryOpen}
					<div class="summary-panel">
						{#if summaryLoading}
							<div class="summary-loading">
								<div class="loading-indicator small"></div>
								<span>Generating summary...</span>
							</div>
						{:else if summaryError}
							<div class="summary-error">{summaryError}</div>
							<button type="button" class="summary-action" onclick={generateSummary}>Retry</button>
						{:else if summaryText}
							<p class="summary-text">{summaryText}</p>
							<button type="button" class="summary-action" onclick={generateSummary}
								>Regenerate</button
							>
						{:else}
							<div class="summary-empty">No summary yet</div>
						{/if}
					</div>
				{/if}
			</div>
			<Icon
				name="Trash"
				onClick={handleDeleteProfile}
				disabled={isDeleting}
				ariaLabel="Delete profile"
				tooltipProps={{ content: 'delete profile' }}
			/>
		{/snippet}
	</ProfileTopbar>

	{#if loading}
		<div class="loading-container">
			<div class="loading-indicator"></div>
		</div>
	{:else if profile}
		<div class="articles-container">
			<ArticleList
				items={articleCacheStore.articlesWithoutProfile}
				loading={articleCacheStore.loadingArticles}
				hasMore={articleCacheStore.hasMoreArticles}
				onLoadMore={() => articleCacheStore.loadMoreArticles()}
				onArticleClick={handleNavigateToArticle}
			/>
		</div>
	{:else}
		<div class="empty-state">
			<div class="empty-state-pill">Profile not found</div>
		</div>
	{/if}
</div>

<style>
	.profile-page {
		display: flex;
		flex-direction: column;
		align-items: center;
		width: 100%;
		min-height: 100vh;
		padding-top: 1rem;
		padding-left: 1.5rem;
		padding-right: 2rem;
		padding-bottom: 7rem;
	}

	:global(.spin) {
		animation: spin 0.8s linear infinite;
	}

	.summary-wrapper {
		position: relative;
	}

	.summary-panel {
		position: absolute;
		top: calc(100% + 8px);
		right: 0;
		width: 320px;
		max-width: 90vw;
		z-index: 100;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1rem;
		border-radius: var(--radius-md);
		background: rgba(30, 30, 30, 0.92);
		backdrop-filter: blur(8px);
		border: 1px solid rgba(255, 255, 255, 0.1);
		box-shadow: 0 8px 16px rgba(0, 0, 0, 0.4);
	}

	.summary-text {
		margin: 0;
		line-height: 1.5;
		font-size: 0.9rem;
		white-space: pre-wrap;
		word-break: break-word;
	}

	.summary-loading {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		color: var(--primary-color);
		font-style: italic;
	}

	.loading-indicator.small {
		width: 16px;
		height: 16px;
		border-width: 2px;
	}

	.summary-error {
		color: #ff6666;
		font-size: 0.85rem;
		word-break: break-word;
	}

	.summary-action {
		all: unset;
		align-self: flex-start;
		cursor: pointer;
		padding: 0.35rem 0.9rem;
		border-radius: var(--radius-sm);
		background: rgba(255, 255, 255, 0.1);
		color: var(--primary-color);
		font-size: 0.85rem;
		font-weight: bold;
		transition: background 0.15s;
	}

	.summary-action:hover {
		background: rgba(255, 255, 255, 0.18);
	}

	.summary-empty {
		opacity: 0.6;
		font-style: italic;
		font-size: 0.9rem;
	}

	.loading-container {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 200px;
	}

	.loading-indicator {
		width: 30px;
		height: 30px;
		border: 3px solid rgba(255, 255, 255, 0.2);
		border-top-color: var(--primary-color);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.articles-container {
		width: 100%;
		padding-top: 4.5rem;
	}

	.empty-state {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		padding: 3rem 0;
	}

	.empty-state-pill {
		opacity: 0.6;
		border: 1px dashed var(--primary-color);
		border-radius: var(--radius-lg);
		padding: 7px 20px;
		color: var(--primary-color);
		font-weight: bold;
		font-size: 0.88rem;
		line-height: 1.2;
	}
</style>
