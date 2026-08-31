<script lang="ts">
	import ProfileWidget from '@/components/ProfileWidget.svelte';
	import LoadMoreSentinel from '@/components/LoadMoreSentinel.svelte';
	import { articleCacheStore } from '@/stores/articleCacheStore.svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import { onMount } from 'svelte';

	onMount(async () => {
		await articleCacheStore.fetchProfilesWithArticles({
			categoryIds: [...viewState.selectedCategories]
		});
	});

	$effect(() => {
		const categories = [...viewState.selectedCategories];
		void articleCacheStore.fetchProfilesWithArticles({ force: true, categoryIds: categories });
	});
</script>

<div class="flex-squares">
	{#each articleCacheStore.profilesWithArticles as profile (profile.id)}
		<ProfileWidget
			profileWithArticles={profile}
			showTitle={false}
			collapsed={viewState.collapseProfiles}
		/>
	{:else}
		{#if articleCacheStore.loadingProfiles}
			<div class="empty-profiles-container"></div>
		{:else}
			<div class="empty-profiles-container">
				<div class="empty-profiles-pill">404</div>
			</div>
		{/if}
	{/each}
	{#if articleCacheStore.hasMoreProfiles}
		<LoadMoreSentinel
			onLoadMore={() => articleCacheStore.loadMoreProfiles()}
			disabled={articleCacheStore.loadingProfiles}
		/>
	{/if}
</div>

<style>
	.flex-squares {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 2rem;
		width: 100%;
		padding-bottom: 20%;
	}

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
