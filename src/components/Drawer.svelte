<script lang="ts">
	import { slide } from 'svelte/transition';
	import { drawersState } from '@/stores/viewStore.svelte';
	import type { Snippet } from 'svelte';

	let { name, children, onClose }: { name: string; children?: Snippet; onClose?: () => void } =
		$props();

	const isOpen = $derived(drawersState.isOpen(name));
	let wasOpen = $state(false);

	function handleClose() {
		drawersState.close(name);
	}

	$effect(() => {
		if (wasOpen && !isOpen) {
			console.log('Drawer closed, calling onClose');
			onClose?.();
		}
		wasOpen = isOpen;
	});
</script>

{#if isOpen}
	<div class="drawer-backdrop" role="presentation" onclick={handleClose}>
		<div
			class="drawer-panel"
			in:slide={{ axis: 'x', duration: 150 }}
			out:slide={{ axis: 'x', duration: 150 }}
			onclick={(e) => e.stopPropagation()}
		>
			{@render children?.()}
		</div>
	</div>
{/if}

<style>
	.drawer-backdrop {
		position: fixed;
		inset: 0;
		z-index: 1200;
		background: rgba(0, 0, 0, 0.92);
	}

	.drawer-panel {
		position: absolute;
		color: var(--primary-color);
		top: 0;
		right: 0;
		width: min(500px, 90%);

		height: 100%;
		overflow-y: auto;
		background: rgba(14, 14, 14, 0.95);
	}
</style>
