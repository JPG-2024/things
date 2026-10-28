<script lang="ts" generics="T">
	import type { Snippet } from 'svelte';
	import type { ItemTransition } from '@/lib/utils/itemTransitions';
	import { viewState } from '@/stores/viewStore.svelte';

	interface Props {
		items: T[];
		itemTransition: ItemTransition;
		/** Renders each item's card inside the grid cell. */
		row: Snippet<[T]>;
		key: (item: T) => string | number;
		/** Extra content rendered after the last card (load-more sentinel). */
		sentinel?: Snippet;
	}

	let { items, itemTransition, row, key, sentinel = undefined }: Props = $props();

	// Mirror items after mount so the keyed {#each} sees them as added. Svelte
	// suppresses intro transitions for elements present during the initial
	// render, which is the case when re-entering a tab with cached data.
	// The suggested writable $derived would evaluate during the initial render and
	// defeat this.
	// eslint-disable-next-line svelte/prefer-writable-derived
	let renderedItems = $state<T[]>([]);

	$effect(() => {
		renderedItems = items;
	});
</script>

<div class="profile-list-container">
	<div
		class="profile-list"
		style="--grid-cols-narrow: {viewState.gridColumnsNarrow}; --grid-cols-wide: {viewState.gridColumnsWide};"
	>
		{#each renderedItems as item (key(item))}
			<div class="profile-row" in:itemTransition out:itemTransition>
				{@render row(item)}
			</div>
		{/each}
		{#if sentinel}
			<div class="sentinel-cell">
				{@render sentinel()}
			</div>
		{/if}
	</div>
</div>

<style>
	/* The container measures the content area (it shrinks when the filters
	   panel opens), so the breakpoint applies to the width the grid actually
	   has — a media query would read the viewport and stay wrong then. The
	   800px is a literal because a container-query condition cannot read a
	   CSS variable. */
	.profile-list-container {
		container-type: inline-size;
		width: 100%;
		min-width: 0;
	}

	/* Fluid card grid: cards fill their cell (Card is width/height 100%), so
	   every card of a row takes the height of the tallest one for free. */
	.profile-list {
		display: grid;
		grid-template-columns: repeat(var(--grid-cols-narrow, 2), minmax(0, 1fr));
		gap: 1rem;
		width: 100%;
		padding-inline: 4rem;
		padding-bottom: 4rem;
		box-sizing: border-box;
	}

	@container (min-width: 800px) {
		.profile-list {
			grid-template-columns: repeat(var(--grid-cols-wide, 3), minmax(0, 1fr));
		}
	}

	/* Rows snap to the top of the dashboard scrollport (opt-in from Settings;
	   inert while `scroll-snap-type` is not set on #dashboard-content). All
	   cards of a row share this top edge, so the row produces one snap point. */
	.profile-row {
		display: grid;
		scroll-snap-align: start;
		min-width: 0;
	}

	/* The sentinel spans every column so it starts its own full-width row. */
	.sentinel-cell {
		grid-column: 1 / -1;
		min-width: 0;
	}
</style>
