<script lang="ts">
	import Card from '@/components/Card.svelte';
	import Icon from '@/components/Icon.svelte';
	import { urlRouter } from '@/lib/urlRouter/urlRouter';
	import { navigate, toVTName } from '@/lib/utils/url';
	import {
		deleteProfileById,
		getArticlesByProfile,
		getProfiles,
		type ArticleWithTasks
	} from '@/stores/webStore';
	import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';

	interface Props {
		categoryId: string;
		name?: string;
		showTitle?: boolean;
		onDeleted?: (profileId: string) => void | Promise<void>;
	}

	let { categoryId, name = '', showTitle = false, onDeleted }: Props = $props();

	const queryClient = useQueryClient();

	const query = createQuery({
		queryKey: ['articles', categoryId],
		queryFn: () =>
			getArticlesByProfile(categoryId, {
				limit: 20,
				createdAtFrom: Date.now() - 1000 * 60 * 60 * 24 * 30
			}),
		refetchOnWindowFocus: 'always'
	});

	const profilesQuery = createQuery({
		queryKey: ['profiles'],
		queryFn: getProfiles
	});

	const profile = $derived($profilesQuery.data?.find((p) => p.id === categoryId));

	function handleRefresh() {
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

	async function handleNavigateToArticle(article: ArticleWithTasks) {
		if (!article.url) return;
		await urlRouter(article.url);
		navigate(`/youtube/${encodeURIComponent(article.url)}`);
	}

	function handleDeleteProfile() {
		if ($mutation.status === 'pending') return;
		$mutation.mutate(categoryId);
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
						disabled={$query.isFetching}
						aria-label={`Refresh ${name}`}
						title="Refresh"
					>
						<Icon name="RefreshCw" />
					</button>
					<button
						type="button"
						class="delete-btn"
						onclick={handleDeleteProfile}
						disabled={$mutation.status === 'pending'}
						aria-label={`Delete ${name}`}
						title="Delete profile"
					>
						<Icon name="Trash" />
					</button>
				</div>
			</div>
		{/if}
		{#if $query.data?.length}
			<div class="img-flex">
				{#if profile?.picture}
					<img
						src={profile.picture}
						alt={name}
						class="profile-avatar"
						style={`view-transition-name: vt-profile-${toVTName(categoryId)}`}
					/>
				{/if}
				{#each $query.data as article (article.url)}
					<button
						type="button"
						class="img-button"
						onclick={() => handleNavigateToArticle(article)}
						aria-label="View article"
					>
						<img
							src={article.thumbnail}
							alt="Article"
							class="mini-img"
							style={`view-transition-name: vt-main-image-${toVTName(article.url ?? '')}`}
						/>
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
</style>
