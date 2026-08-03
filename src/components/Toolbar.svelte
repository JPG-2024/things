<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		justify?: 'start' | 'end' | 'center' | 'space-between';
		gap?: string;
		class?: string;
		children?: Snippet;
	}

	let { justify = 'end', gap = '0.5rem', class: className = '', children }: Props = $props();
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
	}
</style>
