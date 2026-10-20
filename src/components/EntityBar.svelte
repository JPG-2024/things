<script lang="ts">
	import EmojiString from '@/components/EmojiString.svelte';
	import Tooltip from '@/components/Tooltip.svelte';
	import { viewState } from '@/stores/viewStore.svelte';

	export interface EntityBarItem {
		id: string;
		name: string;
		profilePictureSrc?: string | null;
	}

	interface Props {
		items: EntityBarItem[];
		/** Ids of the currently selected items (facet filters). */
		activeIds?: string[];
		/** Draws a vertical divider between items (e.g. text-only categories). */
		separators?: boolean;
		onSelect?: (item: EntityBarItem) => void;
		onHoverEnter?: (item: EntityBarItem) => void;
		onHoverLeave?: () => void;
	}

	let {
		items,
		activeIds = [],
		separators = false,
		onSelect = undefined,
		onHoverEnter = undefined,
		onHoverLeave = undefined
	}: Props = $props();

	const filterTerm = $derived(viewState.unifiedFilterDraft.trim().toLowerCase());
	const filteredItems = $derived(
		filterTerm ? items.filter((item) => item.name.toLowerCase().includes(filterTerm)) : items
	);

	function isActive(item: EntityBarItem): boolean {
		return activeIds.includes(item.id);
	}
</script>

<div class="entity-bar">
	{#each filteredItems as item, index (item.id)}
		{#if separators && index > 0}
			<span class="entity-divider" aria-hidden="true"></span>
		{/if}
		<button
			type="button"
			class="entity"
			class:entity--picture={!!item.profilePictureSrc}
			class:active={isActive(item)}
			class:inactive={activeIds.length > 0 && !isActive(item)}
			onclick={() => onSelect?.(item)}
			onmouseenter={() => onHoverEnter?.(item)}
			onmouseleave={() => onHoverLeave?.()}
			aria-label={item.name}
		>
			<!-- ignoreMenuCtx: the only EntityBar consumer lives inside the filters
				popup, where the popup context is always open; without this flag the
				suppression rule would keep these tooltips permanently hidden. -->
			<Tooltip content={item.name} ignoreMenuCtx>
				{#if item.profilePictureSrc}
					<img src={item.profilePictureSrc} alt={item.name} class="entity-picture" />
				{:else}
					<EmojiString value={item.name} active={isActive(item)} />
				{/if}
			</Tooltip>
		</button>
	{/each}
</div>

<style>
	.entity-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 0.7rem;
		width: 100%;
	}

	.entity-divider {
		width: 1px;
		height: 1.2rem;
		align-self: center;
		background: rgba(255, 255, 255, 0.15);
	}

	.entity {
		all: unset;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		opacity: 0.5;
		transition:
			opacity 0.15s,
			transform 0.15s;
	}

	.entity-bar:hover .entity:not(.active) {
		opacity: 0.4;
	}

	.entity-bar:hover .entity:hover {
		opacity: 1;
	}

	.entity.active {
		opacity: 1;
	}

	.entity.inactive {
		opacity: 0.2;
	}

	.entity--picture {
		border-radius: 50%;
	}

	.entity-picture {
		display: block;
		width: 2.4rem;
		height: 2.4rem;
		border-radius: var(--radius-sm);
		object-fit: cover;
	}
</style>
