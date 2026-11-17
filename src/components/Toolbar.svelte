<script lang="ts">
	import { setContext, type Snippet } from 'svelte';

	interface Props {
		justify?: 'start' | 'end' | 'center' | 'space-between';
		gap?: string;
		iconSize?: number;
		class?: string;
		layout?: 'flex' | 'grid';
		children?: Snippet;
	}

	let {
		justify = 'end',
		gap = '0.8rem',
		iconSize,
		class: className = '',
		layout = 'flex',
		children
	}: Props = $props();

	setContext('toolbar-icon-size', iconSize);
</script>

<div class="toolbar toolbar--{layout} {className}" style:justify-content={justify} style:gap>
	{#if children}
		{@render children()}
	{/if}
</div>

<style>
	.toolbar {
		display: flex;
		align-items: center;
		width: 100%;
		padding: 0 2rem;
	}

	.toolbar--grid {
		display: grid;
		/* Consumers can redefine the tracks and areas (e.g. the dashboard
		   header wraps its tabs on narrow windows) without fighting Svelte's
		   scoped styles. Defaults preserve the original three-column grid. */
		grid-template-columns: var(--toolbar-grid-columns, 1fr auto 1fr);
		grid-template-areas: var(--toolbar-grid-areas, none);
		align-items: center;
	}
</style>
