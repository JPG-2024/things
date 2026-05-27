<script lang="ts">
	import Card from '@/components/Card.svelte';
	import Icon from '@/components/Icon.svelte';
	import Tooltip from '@/components/Tooltip.svelte';
	import { urlRouter } from '@/lib/urlRouter/urlRouter';
	import { navigate, toVTName } from '@/lib/utils/url';
	import { getProfileUrl } from '@/lib/utils/youtube';
	import { youtubeProfileRunner } from '@/runners/youtube/profileVideosRunner';
	import {
		deleteProfileById,
		getArticlesByProfile,
		type ArticleProfile,
		type ArticleWithTasks
	} from '@/stores/tasksStore';
	import { workflowStore } from '@/stores/workflowStore.svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import { createMutation, createQuery, useQueryClient } from '@tanstack/svelte-query';

	interface Props {
		profile: ArticleProfile;
		showTitle?: boolean;
		onDeleted?: (profileId: string) => void | Promise<void>;
	}

	let { profile, showTitle = false, onDeleted }: Props = $props();

	const queryClient = useQueryClient();

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

	async function handleRefresh() {
		if (isProfileRunning) return;
		const profileUrl = getProfileUrl(profile.name);
		await youtubeProfileRunner(profileUrl);
		$query.refetch();
	}

	const mutation = createMutation({
		mutationFn: async (profileId: string) => {
			const result = await deleteProfileById(profileId);
			if (!result.success) {
				throw new Error('Failed to delete profile');
			}
			return result;
		},
		onSuccess: async (_, profileId) => {
			queryClient.invalidateQueries({ queryKey: ['articles', profileId] });
			await onDeleted?.(profileId);
		}
	});

	function handleNavigateToArticle(article: ArticleWithTasks) {
		if (!article.url) return;
		navigate(`/youtube/${encodeURIComponent(article.url)}`);
		urlRouter(article.url);
	}

	function handleDeleteProfile() {
		if ($mutation.status === 'pending') return;
		$mutation.mutate(profile.id);
	}

	$effect(() => {
		console.log(
			'[ProfileWidget] isProfileRunning:',
			isProfileRunning,
			'| profileRunStatus:',
			profileRunStatus,
			'| profileRunId:',
			profileRunId,
			'| iaTaskProgress:',
			iaTaskProgress
		);
	});
</script>

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
					<button
						type="button"
						class="delete-btn"
						onclick={handleDeleteProfile}
						disabled={$mutation.status === 'pending'}
						aria-label={`Delete ${profile.name}`}
						title="Delete profile"
					>
						<Icon name="Trash" />
					</button>
				</div>
			</div>
		{/if}
		{#if $query.data?.length}
			<div class="img-flex">
				{#if profile.profilePicture}
					<img
						src={profile.profilePicture}
						alt={profile.name}
						class="profile-avatar"
						style={`view-transition-name: vt-profile-${toVTName(profile.id)}`}
						onmouseenter={() => {
							viewState.hoveredProfileName = profile.name;
							viewState.hoveredProfileId = profile.id;
						}}
						onmouseleave={() => {
							viewState.hoveredProfileName = null;
							viewState.hoveredProfileId = null;
						}}
					/>
				{/if}
				{#each $query.data as article (article.url)}
					<button
						type="button"
						class="img-button"
						onclick={() => handleNavigateToArticle(article)}
						onmouseenter={() => (viewState.hoveredArticleUrl = article.url ?? null)}
						onmouseleave={() => (viewState.hoveredArticleUrl = null)}
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

<style>
	.category-widget {
		display: flex;
		flex-direction: column;
		width: max-content;
		align-items: center;
		box-sizing: border-box;
	}

	.delete-btn {
		all: unset;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		border-radius: 999px;
		padding: 0.3rem;
		background: rgba(255, 255, 255, 0.08);
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
		transform: scale(1.05);
		z-index: 20;
	}

	.mini-img {
		width: 80px;
		height: 55px;
		border-radius: 12px;
		object-fit: cover;
		display: block;
	}

	.profile-avatar {
		width: 50px;
		height: 50px;
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
