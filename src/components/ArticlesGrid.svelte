<script lang="ts" generics="T extends object">
	import type { Snippet } from 'svelte';
	import MasonryGrid from '@/components/MasonryGrid.svelte';
	import Tabs from '@/components/Tabs.svelte';
	import { viewState, PROFILE_ARTICLE_TABS } from '@/stores/viewStore.svelte';
	import type { LayoutKey } from '@/components/MasonryGrid.svelte';

	interface Props {
		items: T[];
		keyOf?: (item: T) => string;
		children: Snippet<[T, number, number, LayoutKey]>;
	}

	let { items, keyOf, children }: Props = $props();
</script>

<MasonryGrid {items} {keyOf}>
	{#snippet headerLeft()}
		<Tabs tabs={PROFILE_ARTICLE_TABS} bind:activeTab={viewState.activeProfileArticleTab} iconOnly />
	{/snippet}
	{#snippet children(item, i, layoutIndex, layoutKey)}
		{@render children(item, i, layoutIndex, layoutKey)}
	{/snippet}
</MasonryGrid>
