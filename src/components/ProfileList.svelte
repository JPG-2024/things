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
		columns?: boolean;
		/** Column width in columns mode (e.g. '17rem'). */
		columnWidth?: string;
		/** Items stacked vertically inside a single wheel column. */
		rowsPerColumn?: number;
		/** Vertical gap between stacked rows. */
		rowGap?: number;
		/** Wheel track height (any CSS length). */
		height?: string;
		sentinel?: Snippet;
	}

	let {
		items,
		itemTransition,
		row,
		key,
		columns = false,
		columnWidth = PROFILE_COLUMN_WIDTH,
		rowsPerColumn = 1,
		rowGap = 24,
		height = 'auto',
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
			gap={60}
			{rowGap}
			rows={rowsPerColumn}
			{height}
			scrollSpeed={12}
			keyboard
			label="Column cards"
			edgeSpace="25vw"
		>
			{#each renderedItems as item (key(item))}
				<div
					class="profile-row"
					class:column={columns}
					style:width={columns ? columnWidth : undefined}
					in:itemTransition
					out:itemTransition
				>
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
	.profile-row.column {
		max-width: none;
	}

	.sentinel-cell {
		/* Span every row so the sentinel starts its own column instead of
		   filling a partial column left over from an uneven item count. */
		grid-row: 1 / -1;
		align-self: center;
		width: 8rem;
	}
</style>
