<script lang="ts">
	import Card from '@/components/Card.svelte';
	import Icon from '@/components/Icon.svelte';
	import Tooltip from '@/components/Tooltip.svelte';
	import WheelStage from '@/components/WheelStage.svelte';
	import { urlRouter } from '@/lib/urlRouter/urlRouter';
	import { toVTName } from '@/lib/utils/url';
	import { getProfileUrl } from '@/lib/utils/youtube';
	import { goto } from '$app/navigation';
	import { type ArticleProfile, type ArticleWithTasks } from '@/stores/webStore';
	import { workflowStore } from '@/stores/workflowStore.svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import { articleCacheStore } from '@/stores/articleCacheStore.svelte';
	import { fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';

	interface Props {
		profileWithArticles: ArticleProfile;
		showTitle?: boolean;
		collapsed?: boolean;
	}

	let { profileWithArticles, showTitle = false, collapsed = false }: Props = $props();
	let isCollapsed = $state(false);

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
</script>

<div
	class="category-container"
	in:fade={{ duration: 700, easing: cubicOut }}
	out:fade={{ duration: 80 }}
>
	<div class="category-widget">
		<Card loading={isProfileRunning}>
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
				<div class="img-flex">
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
										viewState.hoveredProfileName = profileWithArticles.name;
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
						<div class="strip-wrap">
							<WheelStage fadeEdges gap={16} scrollSpeed={6}>
								{#each visibleArticles as article (article.url)}
									<button
										type="button"
										class="img-button"
										onclick={() => handleNavigateToArticle(article)}
										onmouseenter={() => {
											viewState.hoveredArticleUrl = article.url ?? null;
											viewState.hoveredPictureSrc = article.thumbnailSrc ?? null;
										}}
										onmouseleave={() => {
											viewState.hoveredArticleUrl = null;
										}}
										aria-label="View article"
									>
										<div class="thumbnail-container">
											{#if !article.viewed}
												<span class="unread-dot"></span>
											{/if}
											<Tooltip content={article.title ?? ''}>
												{#if article.thumbnailSrc}
													<img
														src={article.thumbnailSrc}
														alt="Article"
														class="mini-img"
														style={`view-transition-name: vt-main-image-${toVTName(article.url ?? '')}`}
													/>
												{:else}
													<div class="mini-img-fallback" title={article.title ?? ''}>
														{article.title?.slice(0, 45).concat('...') ?? ''}
													</div>
												{/if}
											</Tooltip>
										</div>
									</button>
								{/each}
							</WheelStage>
						</div>
					{/if}
				</div>
			{/if}
		</Card>
	</div>
</div>

<style>
	.category-container {
	}

	.thumbnail-container {
		position: relative;
		display: inline-flex;
	}

	.unread-dot {
		position: absolute;
		top: 0px;
		right: -5px;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--primary-color);
		z-index: 10;
	}

	.category-widget {
		display: flex;
		flex-direction: column;
		align-items: center;
		box-sizing: border-box;
		padding: 1px;
		width: 100%;
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

	.avatar-container {
		display: flex;
		position: relative;
		align-items: center;
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

	.mini-img {
		display: block;
		border-radius: var(--radius-md);
		width: 5rem;
		height: 4rem;
		object-fit: cover;
	}

	.mini-img-fallback {
		display: -webkit-box;
		justify-content: center;
		align-items: center;
		border-radius: var(--radius-lg);
		width: 5rem;
		height: 4rem;
		padding: 0.25rem;
		background: rgba(255, 255, 255, 0.05);
		color: rgba(255, 255, 255, 0.75);
		font-size: 0.65rem;
		line-height: 1.1;
		text-align: left;
		overflow: hidden;
		-webkit-line-clamp: 4;
		-webkit-box-orient: vertical;
		line-clamp: 4;
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
