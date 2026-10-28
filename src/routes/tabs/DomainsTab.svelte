<script lang="ts">
	import ProfileList from '@/components/ProfileList.svelte';
	import ProfileWidget from '@/components/ProfileWidget.svelte';
	import LoadMoreSentinel from '@/components/LoadMoreSentinel.svelte';
	import { articleCacheStore } from '@/stores/articleCacheStore.svelte';
	import { viewState, articleFilters } from '@/stores/viewStore.svelte';
	import { tabAnimationStore } from '@/stores/tabAnimationStore.svelte';

	const domainItemTransition = tabAnimationStore.transitionFor('domains');

	const visibleDomains = $derived.by(() => {
		const ids = articleFilters.ids('domains');
		if (ids.length === 0) return articleCacheStore.domainsWithArticles;
		// Narrowing is client-side over the loaded pages; entities beyond the
		// loaded pages appear once their page loads.
		return articleCacheStore.domainsWithArticles.filter((domain) => ids.includes(domain.id));
	});

	$effect(() => {
		void articleCacheStore.fetchDomainsWithArticles({
			card: viewState.cardLayout.domains,
			categoryIds: articleFilters.ids('categories')
		});
	});
</script>

<ProfileList items={visibleDomains} itemTransition={domainItemTransition} key={(d) => d.id}>
	{#snippet row(domain)}
		<ProfileWidget
			profileWithArticles={domain}
			showTitle={false}
			collapsed={viewState.collapseProfiles}
		/>
	{/snippet}
	{#snippet sentinel()}
		{#if articleCacheStore.hasMoreDomains && articleFilters.ids('domains').length === 0}
			<LoadMoreSentinel
				onLoadMore={() => articleCacheStore.loadMoreDomains()}
				disabled={articleCacheStore.loadingDomains}
			/>
		{/if}
	{/snippet}
</ProfileList>
{#if visibleDomains.length === 0}
	{#if articleCacheStore.loadingDomains}
		<div class="empty-profiles-container"></div>
	{:else}
		<div class="empty-profiles-container">
			<div class="empty-profiles-pill">No domains</div>
		</div>
	{/if}
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
