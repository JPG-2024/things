<script lang="ts">
	import ProfileList from '@/components/ProfileList.svelte';
	import ProfileWidget from '@/components/ProfileWidget.svelte';
	import LoadMoreSentinel from '@/components/LoadMoreSentinel.svelte';
	import { entityColumnWidth } from '@/lib/utils/cardLayout';
	import { articleCacheStore } from '@/stores/articleCacheStore.svelte';
	import { viewState, articleFilters } from '@/stores/viewStore.svelte';
	import { tabAnimationStore } from '@/stores/tabAnimationStore.svelte';

	const profileItemTransition = tabAnimationStore.transitionFor('profiles');
	const layout = $derived(viewState.cardLayout.profiles);

	const visibleProfiles = $derived.by(() => {
		const ids = articleFilters.ids('profiles');
		if (ids.length === 0) return articleCacheStore.profilesWithArticles;
		// Narrowing is client-side over the loaded pages; entities beyond the
		// loaded pages appear once their page loads.
		return articleCacheStore.profilesWithArticles.filter((profile) => ids.includes(profile.id));
	});

	$effect(() => {
		void articleCacheStore.fetchProfilesWithArticles({ card: viewState.cardLayout.profiles });
	});
</script>

<ProfileList
	items={visibleProfiles}
	itemTransition={profileItemTransition}
	key={(p) => p.id}
	columns
	columnWidth={entityColumnWidth(layout)}
	cardsPerColumn={layout.cardsPerColumn}
>
	{#snippet row(profile)}
		<ProfileWidget
			profileWithArticles={profile}
			showTitle={false}
			collapsed={viewState.collapseProfiles}
		/>
	{/snippet}
</ProfileList>
{#if visibleProfiles.length === 0}
	{#if articleCacheStore.loadingProfiles}
		<div class="empty-profiles-container"></div>
	{:else}
		<div class="empty-profiles-container">
			<div class="empty-profiles-pill">404</div>
		</div>
	{/if}
{/if}
{#if articleCacheStore.hasMoreProfiles && articleFilters.ids('profiles').length === 0}
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
