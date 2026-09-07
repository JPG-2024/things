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

	let layoutIndex = $derived.by(() => {
		switch (viewState.activeProfileArticleTab) {
			case 'categories':
				return viewState.masonryCategoriesLayoutIndex;
			case 'profiles':
				return viewState.masonryProfilesLayoutIndex;
			default:
				return viewState.masonryArticlesLayoutIndex;
		}
	});

	let columnOffset = $derived.by(() => {
		switch (viewState.activeProfileArticleTab) {
			case 'categories':
				return viewState.masonryCategoriesColumnOffset;
			case 'profiles':
				return viewState.masonryProfilesColumnOffset;
			default:
				return viewState.masonryArticlesColumnOffset;
		}
	});

	function setLayoutIndex(value: number) {
		switch (viewState.activeProfileArticleTab) {
			case 'categories':
				viewState.masonryCategoriesLayoutIndex = value;
				break;
			case 'profiles':
				viewState.masonryProfilesLayoutIndex = value;
				break;
			default:
				viewState.masonryArticlesLayoutIndex = value;
				break;
		}
	}

	function setColumnOffset(value: number) {
		switch (viewState.activeProfileArticleTab) {
			case 'categories':
				viewState.masonryCategoriesColumnOffset = value;
				break;
			case 'profiles':
				viewState.masonryProfilesColumnOffset = value;
				break;
			default:
				viewState.masonryArticlesColumnOffset = value;
				break;
		}
	}
</script>

<MasonryGrid
	{items}
	{keyOf}
	{layoutIndex}
	{columnOffset}
	onLayoutIndexChange={setLayoutIndex}
	onColumnOffsetChange={setColumnOffset}
	fixedColumns={viewState.activeProfileArticleTab === 'profiles' ? 2 : undefined}
>
	{#snippet headerLeft()}
		<Tabs tabs={PROFILE_ARTICLE_TABS} bind:activeTab={viewState.activeProfileArticleTab} iconOnly />
	{/snippet}
	{#snippet children(item, i, layoutIndex, layoutKey)}
		{@render children(item, i, layoutIndex, layoutKey)}
	{/snippet}
</MasonryGrid>
