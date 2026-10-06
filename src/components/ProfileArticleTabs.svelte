<script lang="ts">
	import Tabs from '@/components/Tabs.svelte';
	import InitialArticlesToggle from '@/components/InitialArticlesToggle.svelte';
	import { viewState, PROFILE_ARTICLE_TABS } from '@/stores/viewStore.svelte';
</script>

<div class="profile-article-tabs">
	<Tabs
		tabs={PROFILE_ARTICLE_TABS}
		bind:activeTab={viewState.activeProfileArticleTab}
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
