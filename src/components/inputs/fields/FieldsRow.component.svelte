<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** Fixed number of equal columns. When omitted, children share the row equally. */
		columns?: number;
		gap?: string;
		align?: 'start' | 'center' | 'stretch';
		children: Snippet;
	}

	let { columns, gap = '1rem', align = 'start', children }: Props = $props();

	const alignValue = $derived(align === 'start' ? 'flex-start' : align);
</script>

<div
	class="fields-row"
	class:grid={columns !== undefined}
	style="--fields-gap: {gap}; --fields-columns: {columns ?? 1}; --fields-align: {alignValue};"
>
	{@render children()}
</div>

<style>
	.fields-row {
		display: flex;
		align-items: var(--fields-align);
		gap: var(--fields-gap);
		width: 100%;
	}

	.fields-row > :global(*) {
		flex: 1;
		min-width: 0;
	}

	.fields-row.grid {
		display: grid;
		grid-template-columns: repeat(var(--fields-columns), minmax(0, 1fr));
	}

	.fields-row.grid > :global(*) {
		flex: unset;
		min-width: 0;
	}
</style>
