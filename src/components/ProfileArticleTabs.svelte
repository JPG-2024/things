<script lang="ts">
	import Tabs from '@/components/Tabs.svelte';
	import InitialArticlesToggle from '@/components/InitialArticlesToggle.svelte';
	import { viewState, PROFILE_ARTICLE_TABS } from '@/stores/viewStore.svelte';
	import {
		tabAnimationStore,
		type ProfileArticleTabId
	} from '@/stores/tabAnimationStore.svelte';

	// Record synchronously before the bound tab value changes, so the entering
	// tab's transitions already read the fresh direction.
	function handleTabChange(tabId: string) {
		tabAnimationStore.recordTabChange(tabId as ProfileArticleTabId);
	}

	// Fallback for programmatic changes that bypass onTabChange (idempotent, so
	// the synchronous path above is unaffected).
	$effect(() => {
		tabAnimationStore.recordTabChange(viewState.activeProfileArticleTab);
	});
</script>

<div class="profile-article-tabs">
	<Tabs
		tabs={PROFILE_ARTICLE_TABS}
		bind:activeTab={viewState.activeProfileArticleTab}
		onTabChange={handleTabChange}
		iconOnly
		iconSize={22}
	/>
<!-- 	{#if viewState.activeProfileArticleTab === 'articles'}
		<InitialArticlesToggle />
	{/if} -->
</div>

<style>
	.profile-article-tabs {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
</style>
