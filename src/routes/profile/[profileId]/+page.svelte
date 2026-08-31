<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { createHotkey } from '@tanstack/svelte-hotkeys';
	import Icon from '@/components/Icon.svelte';
	import MasonryGrid from '@/components/MasonryGrid.svelte';
	import ArticleItem from '@/components/ArticleItem.svelte';
	import LoadMoreSentinel from '@/components/LoadMoreSentinel.svelte';
	import {
		deleteProfileById,
		getProfile,
		type ArticleProfile,
		type ArticleWithTasks
	} from '@/stores/webStore';
	import { viewState } from '@/stores/viewStore.svelte';
	import { articleCacheStore } from '@/stores/articleCacheStore.svelte';
	import { generateProfileSummary } from '@/lib/utils/inference/profileSummary';
	import { urlRouter } from '@/lib/urlRouter/urlRouter';
	import type { LayoutKey } from '@/components/MasonryGrid.svelte';

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
			const profileResult = await getProfile(profileId);
			profile = profileResult;
			await articleCacheStore.fetchArticlesWithoutProfile({ profileId, force: true });
		} finally {
			loading = false;
		}
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
</script>

<svelte:window onclick={handleClickOutside} />

<div class="profile-page">
<div class="top-bar">
			<button type="button" class="back-btn" onclick={handleBack} aria-label="Go back">
				<Icon name="ArrowLeft" size={24} />
			</button>
			<button
				type="button"
				class="back-btn delete-btn"
				onclick={handleDeleteProfile}
				disabled={isDeleting}
				aria-label="Delete profile"
				title="Delete profile"
			>
				<Icon name="Trash" size={24} />
			</button>
			<div bind:this={summaryWrapperEl} class="summary-wrapper">
			<button
				type="button"
				class="back-btn"
				class:active={summaryOpen}
				onclick={toggleSummary}
				aria-label="Profile summary"
				aria-expanded={summaryOpen}
			>
				<Icon name="Sparkles" size={24} />
			</button>
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
						<button type="button" class="summary-action" onclick={generateSummary}>Regenerate</button>
					{:else}
						<div class="summary-empty">No summary yet</div>
					{/if}
				</div>
			{/if}
		</div>
	</div>

	{#if loading}
		<div class="loading-container">
			<div class="loading-indicator"></div>
		</div>
	{:else if profile}
		<div class="profile-header">
			{#if profile.profilePictureSrc}
				<img src={profile.profilePictureSrc} alt={profile.name} class="profile-avatar" />
			{/if}
			<h1 class="profile-name">{profile.name}</h1>
		</div>

		<div class="articles-container">
			{#if articleCacheStore.articlesWithoutProfile.length > 0}
				<MasonryGrid items={articleCacheStore.articlesWithoutProfile}>
{#snippet children(article: ArticleWithTasks, _i: number, _layoutIndex: number, layoutKey: LayoutKey)}
					<ArticleItem
						{article}
						{layoutKey}
							onClick={handleNavigateToArticle}
							onHoverEnter={(a) => {
								viewState.hoveredArticleUrl = a.url ?? null;
								viewState.hoveredPictureSrc = a.thumbnailSrc ?? null;
							}}
							onHoverLeave={() => {
								viewState.hoveredArticleUrl = null;
							}}
						/>
					{/snippet}
				</MasonryGrid>
			{:else if !articleCacheStore.loadingArticles}
				<div class="empty-state">
					<div class="empty-state-pill">No articles</div>
				</div>
			{/if}
			{#if articleCacheStore.loadingArticles && articleCacheStore.articlesWithoutProfile.length === 0}
				<div class="loading-container">
					<div class="loading-indicator"></div>
				</div>
			{/if}
			{#if articleCacheStore.hasMoreArticles}
				<LoadMoreSentinel
					onLoadMore={() => articleCacheStore.loadMoreArticles()}
					disabled={articleCacheStore.loadingArticles}
				/>
			{/if}
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
		min-height: 100vh;
		padding: 1rem;
	}

	.top-bar {
		width: 100%;
		max-width: 1200px;
		margin-bottom: 1rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.back-btn {
		all: unset;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		padding: 0.5rem;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.08);
		transition: background 0.15s;
	}

	.back-btn:hover,
	.back-btn.active {
		background: rgba(255, 255, 255, 0.12);
	}

	.delete-btn {
		margin-left: 0.5rem;
		margin-right: auto;
	}

	.delete-btn:hover,
	.delete-btn:disabled {
		background: rgba(255, 80, 80, 0.15);
	}

	.delete-btn:disabled {
		opacity: 0.5;
		cursor: default;
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
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
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

	.profile-header {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		margin-bottom: 2rem;
	}

	.profile-avatar {
		width: 80px;
		height: 80px;
		border-radius: 50%;
		object-fit: cover;
	}

	.profile-name {
		font-size: 1.5rem;
		font-weight: 600;
		color: var(--primary-color);
		margin: 0;
	}

	.articles-container {
		width: 100%;
		max-width: 1200px;
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