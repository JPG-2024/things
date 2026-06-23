<script lang="ts">
	import Card from '@/components/Card.svelte';
	import Icon from '@/components/Icon.svelte';
	import Tooltip from '@/components/Tooltip.svelte';
	import { urlRouter } from '@/lib/urlRouter/urlRouter';
	import { toVTName } from '@/lib/utils/url';
	import { getProfileUrl } from '@/lib/utils/youtube';
	import { goto } from '$app/navigation';
	import {
		getArticlesByProfile,
		type ArticleProfile,
		type ArticleWithTasks
	} from '@/stores/webStore';
	import { workflowStore } from '@/stores/workflowStore.svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import { createQuery } from '@tanstack/svelte-query';
	import { fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';

	interface Props {
		profile: ArticleProfile;
		showTitle?: boolean;
		collapsed?: boolean;
	}

	let { profile, showTitle = false, collapsed = false }: Props = $props();
	let isCollapsed = $state(false);

	$effect(() => {
		isCollapsed = collapsed;
	});

	function toggleCollapse() {
		isCollapsed = !isCollapsed;
	}

	const profileRunId = getProfileUrl(profile.name);
	const profileRunStatus = $derived(workflowStore.runs.get(profileRunId)?.status);
	const isProfileRunning = $derived(
		profileRunStatus === 'running' || profileRunStatus === 'pending'
	);
	const iaTaskProgress = $derived(workflowStore.getIaTaskProgress(profileRunId));

	const query = createQuery({
		queryKey: ['articles', profile.id],
		queryFn: () =>
			getArticlesByProfile(profile.id, {
				limit: 20,
				createdAtFrom: Date.now() - 1000 * 60 * 60 * 24 * 30
			})
	});

	async function goToprofile() {
		viewState.currentProfileId = profile.id;
		const profileUrl = getProfileUrl(profile.name);
		goto(`/youtube/${encodeURIComponent(profileUrl)}`);
		await urlRouter(profileUrl, {
			runnerOptions: { videosAmount: 20, profileId: profile.id }
		});
	}

	async function handleRefresh() {
		if (isProfileRunning) return;
		const profileUrl = getProfileUrl(profile.name);
		await urlRouter(profileUrl, {
			forceRunTasks: true,
			routine: 'fromUrl',
			runnerOptions: { videosAmount: 3, profileId: profile.id }
		});
		$query.refetch();
	}

	async function handleNavigateToArticle(article: ArticleWithTasks) {
		if (!article.url) return;
		viewState.currentProfileId = profile.id;
		urlRouter(article.url);
		goto(`/youtube/${encodeURIComponent(article.url)}`);
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
					<h2 class="category-title">{profile.name}</h2>
					<div class="actions">
						<button
							type="button"
							class="refresh-btn"
							onclick={handleRefresh}
							disabled={isProfileRunning}
							aria-label={`Refresh ${profile.name}`}
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
			{#if $query.data?.length}
				<div class="img-flex">
					{#if profile.profilePictureSrc}
						<div class="avatar-container">
							<button
								class="img-button"
								type="button"
								onclick={goToprofile}
								aria-label="View article"
							>
								<img
									src={profile.profilePictureSrc}
									alt={profile.name}
									class="profile-avatar"
									onmouseenter={() => {
										viewState.hoveredProfileName = profile.name;
										viewState.hoveredProfileId = profile.id;
									}}
									onmouseleave={() => {
										viewState.hoveredProfileName = null;
										viewState.hoveredProfileId = null;
									}}
								/>
							</button>
							<!-- 							<button
								type="button"
								class="collapse-toggle"
								onclick={toggleCollapse}
								aria-label={isCollapsed ? 'Expand' : 'Collapse'}
								title={isCollapsed ? 'Expand' : 'Collapse'}
							>
								<Icon name={isCollapsed ? 'ChevronRight' : 'ChevronLeft'} />
							</button> -->
						</div>
					{/if}
					{#each ($query.data ?? []).filter((_, i) => !isCollapsed || i === 0) as article (article.url)}
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
									<img
										src={article.thumbnailSrc}
										alt="Article"
										class="mini-img"
										style={`view-transition-name: vt-main-image-${toVTName(article.url ?? '')}`}
									/>
								</Tooltip>
							</div>
						</button>
					{/each}
				</div>
			{:else if $query.isLoading}
				<span>Loading articles...</span>
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
		width: max-content;
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
		flex-wrap: wrap;
		justify-content: center;
		gap: 1rem;
		transition: all 0.25s ease;
		width: 100%;
	}

	.avatar-container {
		display: flex;
		position: relative;
		align-items: center;
	}

	.img-button {
		display: flex;
		align-items: center;
		transition: transform 0.1s;
		cursor: pointer;
		border: none;
		border-radius: 0.5rem;
		background: none;
		padding: 0;
	}

	.img-button:hover {
		transform: scale(1.02);
		z-index: 20;
	}

	.mini-img {
		display: block;
		border-radius: 12px;
		width: 5rem;
		height: 4rem;
		object-fit: cover;
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
