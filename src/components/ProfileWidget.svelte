<script lang="ts">
	import Card from '@/components/Card.svelte';
	import Icon from '@/components/Icon.svelte';
	import WheelStage from '@/components/WheelStage.svelte';
	import ArticleItem from '@/components/ArticleItem/ArticleItem.svelte';
	import { urlRouter } from '@/lib/urlRouter/urlRouter';
	import { getProfileUrl } from '@/lib/utils/youtube';
	import { goto } from '$app/navigation';
	import { type ArticleProfile, type ArticleWithTasks } from '@/stores/webStore';
	import { workflowStore } from '@/stores/workflowStore.svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import { articleCacheStore } from '@/stores/articleCacheStore.svelte';
	import type { ArticleThumbnailSize } from '@/constants';

	interface Props {
		profileWithArticles: ArticleProfile;
		showTitle?: boolean;
		collapsed?: boolean;
		articleLayout?: 'strip' | 'grid';
	}

	let {
		profileWithArticles,
		showTitle = false,
		collapsed = false,
		articleLayout = 'strip'
	}: Props = $props();
	let isCollapsed = $state(false);
	const isGrid = $derived(articleLayout === 'grid');
	const articleThumbnailSize: ArticleThumbnailSize = $derived(isGrid ? 'fill' : 'xs');

	$effect(() => {
		isCollapsed = collapsed;
	});

	function toggleCollapse() {
		isCollapsed = !isCollapsed;
	}

	const profileRunId = getProfileUrl(profileWithArticles.name);
	const profileRunStatus = $derived(workflowStore.runs.get(profileRunId)?.status);
	const isProfileRunning = $derived(
		profileRunStatus === 'running' || profileRunStatus === 'pending'
	);
	const iaTaskProgress = $derived(workflowStore.getIaTaskProgress(profileRunId));
	const articles = $derived(profileWithArticles.articles ?? []);
	const visibleArticles = $derived(isCollapsed ? articles.slice(0, 1) : articles);
	const isDomain = $derived(profileWithArticles.domainId === profileWithArticles.id);

	async function goToprofile() {
		viewState.currentProfileId = profileWithArticles.id;
		goto(`/profile/${profileWithArticles.id}`);
	}

	async function handleRefresh() {
		if (isProfileRunning) return;
		const profileUrl = getProfileUrl(profileWithArticles.name);
		await urlRouter(profileUrl, {
			forceRunTasks: true,
			routine: 'fromUrl',
			runnerOptions: { videosAmount: 3, profileId: profileWithArticles.id }
		});
		articleCacheStore.invalidateProfiles();
		await articleCacheStore.fetchProfilesWithArticles({ force: true });
	}

	async function handleNavigateToArticle(article: ArticleWithTasks) {
		if (!article.url) return;
		viewState.currentProfileId = profileWithArticles.id;
		if (article.url.startsWith('raw-')) {
			goto(`/raw/${article.url}`);
			await urlRouter(article.url);
		} else {
			urlRouter(article.url);
			goto(`/youtube/${encodeURIComponent(article.url)}`);
		}
	}

	function handleArticleHoverEnter(article: ArticleWithTasks) {
		viewState.hoveredArticleUrl = article.url ?? null;
		viewState.hoveredPictureSrc = article.thumbnailSrc ?? null;
	}

	function handleArticleHoverLeave() {
		viewState.hoveredArticleUrl = null;
	}
</script>

{#snippet articleThumb(article: ArticleWithTasks)}
	<ArticleItem
		{article}
		thumbnailOnly
		thumbnailSize={articleThumbnailSize}
		unread={!article.viewed}
		tooltip={article.title ?? null}
		onClick={handleNavigateToArticle}
		onHoverEnter={handleArticleHoverEnter}
		onHoverLeave={handleArticleHoverLeave}
	/>
{/snippet}

<div class="category-container">
	<div class="category-widget" class:fill={isGrid}>
		<Card loading={isProfileRunning} showBorders>
			{#if showTitle}
				<div class="title-row">
					<h2 class="category-title">{profileWithArticles.name}</h2>
					<div class="actions">
						<button
							type="button"
							class="refresh-btn"
							onclick={handleRefresh}
							disabled={isProfileRunning}
							aria-label={`Refresh ${profileWithArticles.name}`}
							title="Refresh"
						>
							{#if isProfileRunning}
								<Icon name="Loader2" class="spin" />
							{:else}
								<Icon name="RefreshCw" />
							{/if}
						</button>
					</div>
				</div>
			{/if}
			{#if profileWithArticles.profilePictureSrc || articles.length}
				<div class="img-flex" class:fill={isGrid}>
					{#if profileWithArticles.profilePictureSrc}
						<div class="avatar-container">
							<button
								class="img-button"
								type="button"
								onclick={goToprofile}
								aria-label="View article"
							>
								<img
									src={profileWithArticles.profilePictureSrc}
									alt={profileWithArticles.name}
									class="profile-avatar"
									onmouseenter={() => {
										if (!isDomain) {
											viewState.hoveredProfileName = profileWithArticles.name;
										}
										viewState.hoveredProfileId = profileWithArticles.id;
									}}
									onmouseleave={() => {
										viewState.hoveredProfileName = null;
										viewState.hoveredProfileId = null;
									}}
								/>
							</button>
						</div>
					{/if}
					{#if visibleArticles.length}
						{#if isGrid}
							<div class="strip-wrap article-grid">
								{#each visibleArticles as article (article.url)}
									{@render articleThumb(article)}
								{/each}
							</div>
						{:else}
							<div class="strip-wrap">
								<WheelStage fadeEdges gap={16} scrollSpeed={6}>
									{#each visibleArticles as article (article.url)}
										{@render articleThumb(article)}
									{/each}
								</WheelStage>
							</div>
						{/if}
					{/if}
				</div>
			{/if}
		</Card>
	</div>
</div>

<style>
	.category-container {
	}

	.category-widget {
		display: flex;
		flex-direction: column;
		align-items: center;
		box-sizing: border-box;
		padding: 1px;
		width: 100%;
	}

	/* Column layout: Card fills the row height and the article grid takes the rest */
	.category-widget.fill {
		height: 100%;
	}

	.category-widget.fill .img-flex {
		flex: 1 1 auto;
		min-height: 0;
	}

	.category-widget.fill .strip-wrap {
		align-self: stretch;
	}

	.title-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0rem;
		padding-inline: 10px;
		width: 100%;
		color: rgba(255, 255, 255, 0.068);
		font-size: 0.5rem;
	}

	.actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.refresh-btn {
		all: unset;
		display: inline-flex;
		justify-content: center;
		align-items: center;
		cursor: pointer;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.08);
		padding: 0.3rem;
	}

	.refresh-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.img-flex {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		min-width: 0;
		transition: all 0.25s ease;
		width: 100%;
	}

	.strip-wrap {
		flex: 1 1 auto;
		min-width: 0;
	}

	/* Grid mode: ArticleItems flow in two columns filling the card */
	.strip-wrap.article-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		grid-auto-rows: auto;
		align-content: start;
		gap: 0.75rem;
		min-height: 0;
		overflow: hidden;
	}

	.strip-wrap.article-grid :global(.article-card) {
		min-width: 0;
	}

	.avatar-container {
		display: flex;
		position: relative;
		align-items: center;
		min-width: 50px;
	}

	.img-button {
		display: flex;
		flex-shrink: 0;
		align-items: center;
		transition: transform 0.1s;
		cursor: pointer;
		border: none;
		border-radius: var(--radius-md);
		background: none;
		padding: 0;
	}

	.img-button:hover {
		transform: scale(1.02);
		z-index: 20;
	}

	.profile-avatar {
		flex-shrink: 0;
		transition: transform 0.1s;
		margin-right: 0.5rem;
		border-radius: 100%;
		width: 3rem;
		height: 3rem;
		object-fit: cover;
	}

	.profile-avatar:hover {
		transform: scale(1.1);
		z-index: 20;
	}

	.collapse-toggle:hover {
		transform: scale(1.1);
		background: rgba(255, 255, 255, 0.2);
	}

	.collapse-toggle {
		all: unset;
		display: inline-flex;
		position: absolute;
		right: -13px;
		justify-content: center;
		align-items: center;
		transition:
			background-color 0.15s ease,
			transform 0.15s ease;
		cursor: pointer;
		border-radius: 999px;
		padding: 0.1rem;
	}

	.spin {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}
</style>
