<script lang="ts">
	import EmojiString from '@/components/EmojiString.svelte';
	import Tooltip from '@/components/Tooltip.svelte';
	import { toVTName } from '@/lib/utils/url';
	import { viewState } from '@/stores/viewStore.svelte';

	export interface EntityBarItem {
		id: string;
		name: string;
		profilePictureSrc?: string | null;
	}

	interface Props {
		items: EntityBarItem[];
		activeId?: string | null;
		onSelect?: (item: EntityBarItem) => void;
		onHoverEnter?: (item: EntityBarItem) => void;
		onHoverLeave?: () => void;
	}

	let {
		items,
		activeId = null,
		onSelect = undefined,
		onHoverEnter = undefined,
		onHoverLeave = undefined
	}: Props = $props();

	const filterTerm = $derived(viewState.unifiedFilter.trim().toLowerCase());
	const filteredItems = $derived(
		filterTerm ? items.filter((item) => item.name.toLowerCase().includes(filterTerm)) : items
	);
</script>

<div class="entity-bar">
	{#each filteredItems as item (item.id)}
		<button
			type="button"
			class="entity"
			class:entity--picture={!!item.profilePictureSrc}
			class:active={activeId === item.id}
			class:inactive={activeId !== null && activeId !== item.id}
			onclick={() => onSelect?.(item)}
			onmouseenter={() => onHoverEnter?.(item)}
			onmouseleave={() => onHoverLeave?.()}
			aria-label={item.name}
		>
			<Tooltip content={item.name}>
				{#if item.profilePictureSrc}
					<img
						src={item.profilePictureSrc}
						alt={item.name}
						class="entity-picture"
						style={`view-transition-name: vt-profile-${toVTName(item.id)}`}
					/>
				{:else}
					<EmojiString value={item.name} active={activeId === item.id} />
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

	.entity {
		all: unset;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		opacity: 0.8;
		transition:
			opacity 0.15s,
			transform 0.15s;
	}

	.entity-bar:hover .entity {
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
		width: 2rem;
		height: 2rem;
		border-radius: var(--radius-md);
		object-fit: cover;
	}
</style>
