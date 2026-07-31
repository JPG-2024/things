<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		label: string;
		hint?: string;
		defaultOpen?: boolean;
		children: Snippet;
	};

	let { label, hint, defaultOpen = false, children }: Props = $props();
</script>

<details class="details-panel" open={defaultOpen}>
	<summary>
		{label}
		{#if hint}
			<span class="details-hint">{hint}</span>
		{/if}
	</summary>
	{@render children()}
</details>

<style>
	.details-panel {
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 5px;
		background: rgba(128, 128, 128, 0.13);
		padding: 2px 10px;
	}

	.details-panel summary {
		cursor: pointer;
		font-size: 0.85rem;
		opacity: 0.8;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.details-hint {
		opacity: 0.5;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 400px;
	}
</style>
