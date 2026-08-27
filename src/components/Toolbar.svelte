<script lang="ts">
	import { setContext, type Snippet } from 'svelte';

	interface Props {
		justify?: 'start' | 'end' | 'center' | 'space-between';
		gap?: string;
		iconSize?: number;
		class?: string;
		children?: Snippet;
	}

	let {
		justify = 'end',
		gap = '0.8rem',
		iconSize,
		class: className = '',
		children
	}: Props = $props();

	setContext('toolbar-icon-size', iconSize);
</script>

<div class="toolbar {className}" style:justify-content={justify} style:gap>
	{#if children}
		{@render children()}
	{/if}
</div>

<style>
	.toolbar {
		display: flex;
		align-items: center;
		width: 100%;
	}
</style>
