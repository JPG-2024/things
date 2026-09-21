<script lang="ts">
	import EntityBar from '@/components/EntityBar.svelte';
	import type { EntityBarItem } from '@/components/EntityBar.svelte';
	import Categories from '@/components/Categories.svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import { getProfiles, type ArticleProfile } from '@/stores/webStore';

	let profiles = $state<ArticleProfile[]>([]);
	let domains = $state<ArticleProfile[]>([]);
	let profilesLoaded = false;
	let domainsLoaded = false;

	$effect(() => {
		const tab = viewState.activeProfileArticleTab;
		if (tab === 'profiles' && !profilesLoaded) {
			profilesLoaded = true;
			void getProfiles({ kind: 'profile' }).then((items) => (profiles = items));
		}
		if (tab === 'domains' && !domainsLoaded) {
			domainsLoaded = true;
			void getProfiles({ kind: 'domain' }).then((items) => (domains = items));
		}
	});

	function handleSelect(item: EntityBarItem) {
		viewState.activeArticleProfileId =
			viewState.activeArticleProfileId === item.id ? null : item.id;
	}

	function handleHoverEnter(item: EntityBarItem) {
		viewState.hoveredProfileName = item.name;
		viewState.hoveredProfileId = item.id;
	}

	function handleHoverLeave() {
		viewState.hoveredProfileName = null;
		viewState.hoveredProfileId = null;
	}
</script>

<div class="tab-header">
	<div class="tab-header-inner">
		{#if viewState.activeProfileArticleTab === 'profiles'}
			<EntityBar
				items={profiles}
				activeId={viewState.activeArticleProfileId}
				onSelect={handleSelect}
				onHoverEnter={handleHoverEnter}
				onHoverLeave={handleHoverLeave}
			/>
		{:else if viewState.activeProfileArticleTab === 'domains'}
			<EntityBar
				items={domains}
				activeId={viewState.activeArticleProfileId}
				onSelect={handleSelect}
			/>
		{:else if viewState.activeProfileArticleTab === 'categories'}
			<Categories />
		{/if}
	</div>
</div>

<style>
	.tab-header {
		display: flex;
		width: 100%;
		height: 100px;
		min-height: 100px;
		box-sizing: border-box;
		overflow: auto;
	}

	.tab-header-inner {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		margin: auto;
		padding: 0.25rem 0;
	}
</style>
