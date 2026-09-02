<script lang="ts">
	import ProfileWidget from '@/components/ProfileWidget.svelte';
	import ArticlesGrid from '@/components/ArticlesGrid.svelte';
	import LoadMoreSentinel from '@/components/LoadMoreSentinel.svelte';
	import { articleCacheStore } from '@/stores/articleCacheStore.svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import { onMount } from 'svelte';
	import type { ArticleProfile } from '@/stores/webStore';

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

<ArticlesGrid items={articleCacheStore.profilesWithArticles} keyOf={(p) => p.id}>
	{#snippet children(profile: ArticleProfile)}
		<ProfileWidget
			profileWithArticles={profile}
			showTitle={false}
			collapsed={viewState.collapseProfiles}
		/>
	{/snippet}
</ArticlesGrid>
{#if articleCacheStore.profilesWithArticles.length === 0}
	{#if articleCacheStore.loadingProfiles}
		<div class="empty-profiles-container"></div>
	{:else}
		<div class="empty-profiles-container">
			<div class="empty-profiles-pill">404</div>
		</div>
	{/if}
{/if}
{#if articleCacheStore.hasMoreProfiles}
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
