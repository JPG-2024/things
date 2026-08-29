<script lang="ts">
	type KeyValueItem = {
		key: string;
		value: string | number;
	};

	type Props = {
		items: KeyValueItem[];
		title?: string;
		row?: boolean;
	};

	let { items, title = undefined, row = false }: Props = $props();
</script>

<div class="kv-panel">
	{#if title}
		<span class="kv-title">{title}</span>
	{/if}
	{#if row}
		<div class="kv-row">
			{#each items as item, i}
				<span class="kv-item">
					<span class="kv-key">{item.key}:</span>
					<span class="kv-value">{item.value}</span>
				</span>
			{/each}
		</div>
	{:else}
		<div class="kv-grid">
			{#each items as item (item.key)}
				<span class="kv-key">{item.key}</span>
				<span class="kv-value">{item.value}</span>
			{/each}
		</div>
	{/if}
</div>

<style>
	.kv-panel {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.kv-title {
		font-size: 0.82rem;
		opacity: 0.55;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.kv-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.8rem 1rem;
	}

	.kv-item {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		white-space: nowrap;
		border: 1px solid rgba(var(--color), 0.8);

		padding: 2px 10px;
		border-radius: var(--radius-sm);
	}

	.kv-sep {
		opacity: 0.3;
	}

	.kv-grid {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.35rem 0.75rem;
		align-items: center;
	}

	.kv-key {
		color: rgba(207, 205, 205, 0.602);
		opacity: 0.55;
		white-space: nowrap;
	}

	.kv-value {
		font-size: 0.82rem;
		opacity: 0.85;
		font-variant-numeric: tabular-nums;
		word-break: break-word;
		min-width: 0;
		font-weight: bold;
	}
</style>
