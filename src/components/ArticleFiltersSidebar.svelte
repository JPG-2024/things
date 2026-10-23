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
	{#if articleFilters.hasActive}
		<div class="sidebar-header" in:fly={{ y: 8, duration: 200 }}>
			<Button icon="X" onClick={handleClearAndClose}>Clear filter</Button>
		</div>
	{:else}
		<div class="sidebar-header centered" in:fly={{ y: 8, duration: 200 }}>
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
	{#if articleFilters.hasActive}
		<div class="sidebar-chips">
			<ActiveFilterChips />
		</div>
	{/if}
	<ArticleFiltersPanel />
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

<style>
	.filters-sidebar {
		display: flex;
		flex-direction: column;
		width: 100%;
	}

	.sidebar-header {
		display: flex;
		align-items: center;
		justify-content: flex-start;
		width: 100%;
	}

	.sidebar-header.centered {
		justify-content: center;
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
		margin-bottom: 0.5rem;
	}

	.sidebar-raw-search {
		display: flex;
		justify-content: center;
		margin-top: 0.75rem;
		padding-top: 0.5rem;
		border-top: 1px solid rgba(255, 255, 255, 0.08);
	}
</style>
