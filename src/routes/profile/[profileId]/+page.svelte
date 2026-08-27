<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import Icon from '@/components/Icon.svelte';
	import MasonryGrid from '@/components/MasonryGrid.svelte';
	import ArticleItem from '@/components/ArticleItem.svelte';
	import LoadMoreSentinel from '@/components/LoadMoreSentinel.svelte';
	import { getProfile, type ArticleProfile, type ArticleWithTasks } from '@/stores/webStore';
	import { viewState } from '@/stores/viewStore.svelte';
	import { articleCacheStore } from '@/stores/articleCacheStore.svelte';
	import { urlRouter } from '@/lib/urlRouter/urlRouter';

	let profileId = $derived(page.params.profileId);
	let profile = $state<ArticleProfile | null>(null);
	let loading = $state(true);

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

<div class="profile-page">
	<div class="top-bar">
		<button type="button" class="back-btn" onclick={handleBack} aria-label="Go back">
			<Icon name="ArrowLeft" size={24} />
		</button>
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
{#snippet children(article: ArticleWithTasks, _i: number, _layoutIndex: number, layoutKey: string)}
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

	.back-btn:hover {
		background: rgba(255, 255, 255, 0.12);
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
