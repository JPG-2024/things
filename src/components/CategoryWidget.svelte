<script lang="ts">
	import Card from '@/components/Card.svelte';
	import Icon from '@/components/Icon.svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import { urlRouter } from '@/lib/urlRouter/urlRouter';
	import { navigate, toVTName } from '@/lib/utils/url';
	import {
		deleteProfileById,
		getArticlesByProfile,
		getProfiles,
		type ArticleWithTasks,
		type ArticleProfile
	} from '@/stores/webStore';
	import { articleCacheStore } from '@/stores/articleCacheStore.svelte';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	interface Props {
		categoryId: string;
		name?: string;
		showTitle?: boolean;
		onDeleted?: (profileId: string) => void | Promise<void>;
	}

	let { categoryId, name = '', showTitle = false, onDeleted }: Props = $props();

	let articles = $state<ArticleWithTasks[]>([]);
	let profile = $state<ArticleProfile | null>(null);
	let isLoading = $state(false);
	let isDeleting = $state(false);

	async function loadData() {
		isLoading = true;
		try {
			const [articlesResult, profilesResult] = await Promise.all([
				getArticlesByProfile(categoryId, {
					limit: 20,
					dateFrom: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString().split('T')[0]
				}),
				getProfiles()
			]);
			articles = articlesResult;
			profile = profilesResult.find((p) => p.id === categoryId) ?? null;
		} finally {
			isLoading = false;
		}
	}

	onMount(() => {
		loadData();
	});

	function handleRefresh() {
		loadData();
	}

	async function handleNavigateToArticle(article: ArticleWithTasks) {
		if (!article.url) return;
		viewState.currentProfileId = categoryId;
		await urlRouter(article.url);
		navigate(`/youtube/${encodeURIComponent(article.url)}`);
	}

	function handleNavigateToProfile() {
		goto(`/profile/${categoryId}`);
	}

	async function handleDeleteProfile() {
		if (isDeleting) return;
		isDeleting = true;
		try {
			const result = await deleteProfileById(categoryId);
			if (result.success) {
				articleCacheStore.invalidate();
				await onDeleted?.(categoryId);
			}
		} finally {
			isDeleting = false;
		}
	}
</script>

<div class="category-widget">
	<Card>
		{#if name && showTitle}
			<div class="title-row">
				<h2 class="category-title">{name}</h2>
				<div class="actions">
					<button
						type="button"
						class="refresh-btn"
						onclick={handleRefresh}
						disabled={isLoading}
						aria-label={`Refresh ${name}`}
						title="Refresh"
					>
						<Icon name="RefreshCw" />
					</button>
					<button
						type="button"
						class="delete-btn"
						onclick={handleDeleteProfile}
						disabled={isDeleting}
						aria-label={`Delete ${name}`}
						title="Delete profile"
					>
						<Icon name="Trash" />
					</button>
				</div>
			</div>
		{/if}
		{#if articles.length}
			<div class="img-flex">
				{#if profile?.profilePictureSrc}
					<button
						type="button"
						class="avatar-button"
						onclick={handleNavigateToProfile}
						aria-label={`View all articles from ${name}`}
					>
						<img
							src={profile.profilePictureSrc}
							alt={name}
							class="profile-avatar"
							style={`view-transition-name: vt-profile-${toVTName(categoryId)}`}
						/>
					</button>
				{/if}
				{#each articles as article (article.url)}
					<button
						type="button"
						class="img-button"
						onclick={() => handleNavigateToArticle(article)}
						aria-label="View article"
					>
						<img
							src={article.thumbnailSrc}
							alt="Article"
							class="mini-img"
							style={`view-transition-name: vt-main-image-${toVTName(article.url ?? '')}`}
						/>
					</button>
				{/each}
			</div>
		{:else if isLoading}
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

	.img-flex {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		align-items: center;
		justify-content: center;
		width: 100%;
		padding: 5px;
	}

	.img-button {
		border: none;
		background: none;
		padding: 0;
		cursor: pointer;
		border-radius: 0.5rem;
		overflow: hidden;
		transition: transform 0.2s;
	}

	.img-button:hover {
		transform: scale(1.05);
	}

	.mini-img {
		width: 100px;
		height: 75px;
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
	}

	.avatar-button {
		all: unset;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		transition: transform 0.2s;
	}

	.avatar-button:hover {
		transform: scale(1.05);
	}
</style>
