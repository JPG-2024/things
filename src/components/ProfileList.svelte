<script lang="ts" generics="T">
	import type { Snippet } from 'svelte';
	import WheelStage from '@/components/WheelStage.svelte';
	import type { ItemTransition } from '@/lib/utils/itemTransitions';
	import { PROFILE_COLUMN_WIDTH } from '@/constants';

	interface Props {
		items: T[];
		itemTransition: ItemTransition;
		/** Renders each item's card inside the row cell. */
		row: Snippet<[T]>;
		key: (item: T) => string | number;
		/** Optional per-item header block (e.g. category name, favicon). */
		header?: Snippet<[T]>;
		/** 'top' pins the header above the card; 'column' renders it as its own wheel cell. */
		headerPlacement?: 'top' | 'column';
		columns?: boolean;
		/** Column width in columns mode (e.g. '17rem'). */
		columnWidth?: string;
		sentinel?: Snippet;
	}

	let {
		items,
		itemTransition,
		row,
		key,
		header = undefined,
		headerPlacement = 'top',
		columns = false,
		columnWidth = PROFILE_COLUMN_WIDTH,
		sentinel = undefined
	}: Props = $props();

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

{#if columns}
	<div class="profile-list columns">
		<WheelStage
			fadeEdges
			gap={60}
			scrollSpeed={7}
			keyboard
			label="Column cards"
			edgeSpace="25vw"
		>
			{#each renderedItems as item (key(item))}
				{#if header && headerPlacement === 'column'}
					<div class="header-column" in:itemTransition out:itemTransition>
						{@render header(item)}
					</div>
				{/if}
				<div
					class="profile-row"
					class:column={columns}
					style:width={columns ? columnWidth : undefined}
					in:itemTransition
					out:itemTransition
				>
					{#if header && headerPlacement === 'top'}
						<div class="header-row">{@render header(item)}</div>
					{/if}
					{@render row(item)}
				</div>
			{/each}
			{#if sentinel}
				<div class="sentinel-cell">
					{@render sentinel()}
				</div>
			{/if}
		</WheelStage>
	</div>
{:else}
	<div class="profile-list">
		{#each renderedItems as item (key(item))}
			<div class="profile-row" in:itemTransition out:itemTransition>
				{@render row(item)}
			</div>
		{/each}
	</div>
{/if}

<style>
	.profile-list {
		display: flex;
		flex-direction: column;
		align-items: center;
		width: 100%;
		gap: 2rem;
	}

	.profile-row {
		width: 100%;
		max-width: 80vw;
		margin: 0 auto;
	}

	/* Columns mode: cards flow horizontally, cardinal scroll handled by WheelStage */
	.profile-list.columns {
		height: min(70vh, 44rem);
	}

	.profile-list.columns :global(.wheel-stage) {
		height: 100%;
	}

	.profile-list.columns :global(.stage-track) {
		height: 100%;
	}

	.profile-row.column {
		max-width: none;
		flex-shrink: 0;
	}

	.header-row {
		box-sizing: border-box;
		padding: 4px 10px 6px;
	}

	.header-column {
		flex-shrink: 0;
		align-self: stretch;
		display: flex;
		align-items: center;
	}

	.sentinel-cell {
		flex: 0 0 auto;
		align-self: center;
		width: 8rem;
	}
</style>
