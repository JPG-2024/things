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
			}),
		refetchOnWindowFocus: 'always'
	});

	async function goToprofile() {
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
		urlRouter(article.url);
		goto(`/youtube/${encodeURIComponent(article.url)}`);
	}
</script>

<div class="category-container">
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
					{#if profile.profilePicture}
						<div class="avatar-container">
							<button
								class="img-button"
								type="button"
								onclick={goToprofile}
								aria-label="View article"
							>
								<img
									src={profile.profilePicture}
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
								viewState.hoveredPictureSrc = article.thumbnail ?? null;
							}}
							onmouseleave={() => {
								viewState.hoveredArticleUrl = null;
							}}
							aria-label="View article"
						>
							<Tooltip content={article.title ?? ''}>
								<img
									src={article.thumbnail}
									alt="Article"
									class="mini-img"
									style={`view-transition-name: vt-main-image-${toVTName(article.url ?? '')}`}
								/>
							</Tooltip>
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

	.category-widget {
		padding: 1px;
		display: flex;
		flex-direction: column;
		width: max-content;
		align-items: center;
		box-sizing: border-box;
	}

	.title-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0rem;
		width: 100%;
		padding-inline: 10px;
		font-size: 0.5rem;
		color: rgba(255, 255, 255, 0.068);
	}

	.actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.refresh-btn {
		all: unset;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		border-radius: 999px;
		padding: 0.3rem;
		background: rgba(255, 255, 255, 0.08);
	}

	.refresh-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.img-flex {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		justify-content: center;
		width: 100%;
		padding: 0.5rem;
		transition: all 0.25s ease;
	}

	.avatar-container {
		position: relative;
		display: flex;
		align-items: center;
	}

	.img-button {
		display: flex;
		align-items: center;
		border: none;
		background: none;
		padding: 0;
		cursor: pointer;
		border-radius: 0.5rem;
		transition: transform 0.1s;
	}

	.img-button:hover {
		transform: scale(1.1);
		z-index: 20;
	}

	.mini-img {
		width: 5rem;
		height: 4rem;
		border-radius: 12px;
		object-fit: cover;
		display: block;
	}

	.profile-avatar {
		width: 3rem;
		height: 3rem;
		border-radius: 100%;
		object-fit: cover;
		flex-shrink: 0;
		margin-right: 0.5rem;
		transition: transform 0.1s;
	}

	.profile-avatar:hover {
		transform: scale(1.1);
		z-index: 20;
	}

	.collapse-toggle:hover {
		background: rgba(255, 255, 255, 0.2);
		transform: scale(1.1);
	}

	.collapse-toggle {
		all: unset;
		position: absolute;
		right: -13px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		border-radius: 999px;
		padding: 0.1rem;
		transition:
			background-color 0.15s ease,
			transform 0.15s ease;
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
