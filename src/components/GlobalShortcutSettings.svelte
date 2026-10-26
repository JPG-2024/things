<script lang="ts">
	import Button from '@/components/inputs/Button.component.svelte';
	import { globalShortcutStore } from '@/stores/globalShortcutStore.svelte';

	async function refresh(): Promise<void> {
		await globalShortcutStore.probe();
	}

	async function register(): Promise<void> {
		await globalShortcutStore.register();
	}
</script>

<div class="global-shortcut">
	<div class="status-row">
		<span class="status-label">Status</span>
		<span class="status" class:bound={globalShortcutStore.bound}>
			{#if !globalShortcutStore.supported}
				Unavailable on this platform
			{:else if globalShortcutStore.bound}
				Bound to {globalShortcutStore.trigger ?? 'the configured key'}
			{:else}
				Not bound
			{/if}
		</span>
	</div>
	{#if globalShortcutStore.error}
		<p class="error">{globalShortcutStore.error}</p>
	{/if}
	<div class="actions">
		<Button onClick={() => void refresh()} disabled={globalShortcutStore.busy}>Refresh</Button>
		<Button
			onClick={() => void register()}
			disabled={globalShortcutStore.busy || !globalShortcutStore.supported}
		>
			{globalShortcutStore.bound ? 'Re-register shortcut' : 'Register shortcut'}
		</Button>
	</div>
</div>

<style>
	.global-shortcut {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		font-size: 0.85rem;
	}

	.status-row {
		display: flex;
		gap: 0.5rem;
		align-items: baseline;
	}

	.status-label {
		color: var(--gray-300);
	}

	.status {
		color: var(--gray-200);
	}

	.status.bound {
		color: var(--primary-color);
	}

	.error {
		margin: 0;
		color: #ff8a8a;
		word-break: break-word;
	}

	.actions {
		display: flex;
		gap: 0.5rem;
	}
</style>
