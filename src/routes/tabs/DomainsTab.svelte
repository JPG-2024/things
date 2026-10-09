<script lang="ts">
	import ProfileList from '@/components/ProfileList.svelte';
	import ProfileWidget from '@/components/ProfileWidget.svelte';
	import LoadMoreSentinel from '@/components/LoadMoreSentinel.svelte';
	import { TAB_PAGE_CONFIG } from '@/constants';
	import { articleCacheStore } from '@/stores/articleCacheStore.svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import { tabAnimationStore } from '@/stores/tabAnimationStore.svelte';

	const domainItemTransition = tabAnimationStore.transitionFor('domains');

	const visibleDomains = $derived(
		viewState.activeArticleProfileId
			? articleCacheStore.domainsWithArticles.filter(
					(domain) => domain.id === viewState.activeArticleProfileId
				)
			: articleCacheStore.domainsWithArticles
	);

	$effect(() => {
		void articleCacheStore.fetchDomainsWithArticles();
	});
</script>

<ProfileList
	items={visibleDomains}
	itemTransition={domainItemTransition}
	columns
	rowsPerColumn={TAB_PAGE_CONFIG.domains.rowsPerColumn}
	key={(d) => d.id}
>
	{#snippet row(domain)}
		<ProfileWidget
			profileWithArticles={domain}
			showTitle={false}
			collapsed={viewState.collapseProfiles}
			articleLayout="grid"
		/>
	{/snippet}
	{#snippet sentinel()}
		{#if articleCacheStore.hasMoreDomains && !viewState.activeArticleProfileId}
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
