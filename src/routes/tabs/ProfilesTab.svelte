<script lang="ts">
	import ProfileList from '@/components/ProfileList.svelte';
	import LoadMoreSentinel from '@/components/LoadMoreSentinel.svelte';
	import { articleCacheStore } from '@/stores/articleCacheStore.svelte';
	import { viewState } from '@/stores/viewStore.svelte';

	const visibleProfiles = $derived(
		viewState.activeArticleProfileId
			? articleCacheStore.profilesWithArticles.filter(
					(profile) => profile.id === viewState.activeArticleProfileId
				)
			: articleCacheStore.profilesWithArticles
	);

	$effect(() => {
		void articleCacheStore.fetchProfilesWithArticles();
	});
</script>

<ProfileList items={visibleProfiles} />
{#if visibleProfiles.length === 0}
	{#if articleCacheStore.loadingProfiles}
		<div class="empty-profiles-container"></div>
	{:else}
		<div class="empty-profiles-container">
			<div class="empty-profiles-pill">404</div>
		</div>
	{/if}
{/if}
{#if articleCacheStore.hasMoreProfiles && !viewState.activeArticleProfileId}
	<LoadMoreSentinel
		onLoadMore={() => articleCacheStore.loadMoreProfiles()}
		disabled={articleCacheStore.loadingProfiles}
	/>
{/if}

<style>
	.empty-profiles-container {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
	}

	.empty-profiles-pill {
		opacity: 0.6;
		transition: opacity 0.15s;
		border: 1px dashed var(--primary-color);
		border-radius: var(--radius-lg);
		padding: 7px 20px;
		color: var(--primary-color);
		font-weight: bold;
		font-size: 0.88rem;
		line-height: 1.2;
	}

	.empty-profiles-pill:hover {
		opacity: 1;
	}
</style>
