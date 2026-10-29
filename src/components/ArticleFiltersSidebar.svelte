<script lang="ts">
	import { fly } from 'svelte/transition';
	import Icon from '@/components/Icon.svelte';
	import ActiveFilterChips from '@/components/ActiveFilterChips.svelte';
	import ArticleFiltersPanel from '@/components/ArticleFiltersPanel.svelte';
	import Button from '@/components/inputs/Button.component.svelte';
	import { articleFilters, viewState } from '@/stores/viewStore.svelte';

	interface Props {
		/** Commits the draft, runs the raw search and closes the panel. */
		onSearchInContent: () => void;
	}

	let { onSearchInContent }: Props = $props();

	/** Header action while filters are active: clears every facet and closes. */
	function handleClearAndClose() {
		articleFilters.clear();
		articleFilters.filtersPanelVisible = false;
	}

	function handleClose() {
		articleFilters.filtersPanelVisible = false;
	}
</script>

<div class="filters-sidebar">
	<div class="sidebar-top">
		{#if articleFilters.hasActive}
			<div class="sidebar-header" in:fly={{ y: -8, duration: 200 }}>
				<Button icon="X" onClick={handleClearAndClose}>Clear filters</Button>
			</div>
			<div class="sidebar-chips">
				<ActiveFilterChips />
			</div>
		{:else}
			<div class="sidebar-header" in:fly={{ y: -8, duration: 200 }}>
				<button
					type="button"
					class="close-trigger"
					onclick={handleClose}
					aria-label="Close filters panel"
				>
					<Icon name="X" />
				</button>
			</div>
		{/if}
		{#if viewState.unifiedFilterDraft.trim()}
			<div class="sidebar-raw-search">
				<Button
					icon="Search"
					disabled={viewState.unifiedFilterDraft.trim().length < 4}
					onClick={onSearchInContent}
				>
					Search in articles content
				</Button>
			</div>
		{/if}
	</div>
	<ArticleFiltersPanel />
</div>

<style>
	.filters-sidebar {
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		gap: 0.25rem;
		width: 100%;
		height: 100%;
		box-sizing: border-box;
		padding: 0 0.5rem;
		border-radius: var(--radius-sm);
	}

	.sidebar-top {
		display: flex;
		align-items: center;
		gap: 1rem;
		min-width: 0;
	}

	.sidebar-header {
		display: flex;
		align-items: center;
		justify-content: flex-start;
		flex-shrink: 0;
	}

	.close-trigger {
		all: unset;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		padding: 0.45rem;
		opacity: 0.6;
		transition: opacity 0.15s;
	}

	.close-trigger:hover {
		opacity: 1;
	}

	.sidebar-chips {
		flex: 1 1 auto;
		min-width: 0;
	}

	.sidebar-raw-search {
		display: flex;
		justify-content: center;
		margin-left: auto;
		flex-shrink: 0;
	}
</style>
