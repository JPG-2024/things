<script lang="ts">
	import Icon from '@/components/Icon.svelte';
	import EntityCard from '@/components/EntityCard.svelte';
	import { urlRouter } from '@/lib/urlRouter/urlRouter';
	import { getProfileUrl } from '@/lib/utils/youtube';
	import { goto } from '$app/navigation';
	import { type ArticleProfile, type ArticleWithTasks } from '@/stores/webStore';
	import { workflowStore } from '@/stores/workflowStore.svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import { articleCacheStore } from '@/stores/articleCacheStore.svelte';

	interface Props {
		profileWithArticles: ArticleProfile;
		showTitle?: boolean;
		/** Collapsed cards show a single article row. */
		collapsed?: boolean;
	}

	let { profileWithArticles, showTitle = false, collapsed = false }: Props = $props();

	const profileRunId = getProfileUrl(profileWithArticles.name);
	const profileRunStatus = $derived(workflowStore.runs.get(profileRunId)?.status);
	const isProfileRunning = $derived(
		profileRunStatus === 'running' || profileRunStatus === 'pending'
	);
	const articles = $derived(profileWithArticles.articles ?? []);
	const isDomain = $derived(profileWithArticles.domainId === profileWithArticles.id);
	const layout = $derived(viewState.cardLayout[isDomain ? 'domains' : 'profiles']);
	const gridRows = $derived(collapsed ? 1 : layout.rows);

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

<EntityCard
	{articles}
	columns={layout.columns}
	rows={gridRows}
	unread={true}
	loading={isProfileRunning}
	onArticleClick={handleNavigateToArticle}
	onArticleHoverEnter={handleArticleHoverEnter}
	onArticleHoverLeave={handleArticleHoverLeave}
>
	{#snippet header()}
		{#if showTitle}
			<div class="title-row">
				<h2 class="category-title">{profileWithArticles.name}</h2>
				<button
					type="button"
					class="refresh-btn"
					onclick={handleRefresh}
					disabled={isProfileRunning}
					aria-label={`Refresh ${profileWithArticles.name}`}
					title="Refresh"
				>
					{#if isProfileRunning}
						<span class="spin"><Icon name="Loader2" /></span>
					{:else}
						<Icon name="RefreshCw" />
					{/if}
				</button>
			</div>
		{/if}
		<div class="identity-row">
			{#if profileWithArticles.profilePictureSrc}
				<button class="img-button" type="button" onclick={goToprofile} aria-label="View profile">
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
			{/if}
			<button
				class="profile-name"
				type="button"
				onclick={goToprofile}
				title={profileWithArticles.name}
			>
				{profileWithArticles.name}
			</button>
		</div>
	{/snippet}
</EntityCard>

<style>
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

	.category-title {
		margin: 0;
		font-size: inherit;
		font-weight: inherit;
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

	.identity-row {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.6rem;
		max-width: 100%;
		min-width: 0;
	}

	.profile-name {
		all: unset;
		font-family: var(--font-secondary);
		overflow: hidden;
		cursor: pointer;
		color: rgba(255, 255, 255, 0.825);
		font-size: 0.85rem;
		line-height: 1.1;
		white-space: nowrap;
		text-overflow: ellipsis;
		font-weight: bold;
	}

	.profile-name:hover {
		color: var(--primary-color);
	}

	.profile-avatar {
		flex-shrink: 0;
		transition: transform 0.1s;
		border-radius: 100%;
		width: 3rem;
		height: 3rem;
		object-fit: cover;
	}

	.profile-avatar:hover {
		transform: scale(1.1);
		z-index: 20;
	}

	.spin {
		display: inline-flex;
		animation: spin 1s linear infinite;
	}

	.spin :global(svg) {
		display: block;
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
