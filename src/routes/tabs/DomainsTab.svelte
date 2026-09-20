<script lang="ts">
	import ProfileList from '@/components/ProfileList.svelte';
	import LoadMoreSentinel from '@/components/LoadMoreSentinel.svelte';
	import { articleCacheStore } from '@/stores/articleCacheStore.svelte';
	import { viewState } from '@/stores/viewStore.svelte';

	$effect(() => {
		const categories = [...viewState.selectedCategories];
		void articleCacheStore.fetchDomainsWithArticles({ categoryIds: categories });
	});
</script>

<ProfileList items={articleCacheStore.domainsWithArticles} />
{#if articleCacheStore.domainsWithArticles.length === 0}
	{#if articleCacheStore.loadingDomains}
		<div class="empty-profiles-container"></div>
	{:else}
		<div class="empty-profiles-container">
			<div class="empty-profiles-pill">No domains</div>
		</div>
	{/if}
{/if}
{#if articleCacheStore.hasMoreDomains}
	<LoadMoreSentinel
		onLoadMore={() => articleCacheStore.loadMoreDomains()}
		disabled={articleCacheStore.loadingDomains}
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
