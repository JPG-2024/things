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
			in:slide={{ axis: 'y', duration: 150 }}
			out:slide={{ axis: 'y', duration: 150 }}
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
		bottom: 0;
		left: 0;
		width: 100%;
		height: 90%;
		overflow-y: auto;
		background: rgba(14, 14, 14, 0.95);
	}

	.drawer-panel::after {
		content: '';
		position: absolute;
		top: 0;
		right: 0;
		width: 100%;
		height: 1px;
		background: linear-gradient(
			270deg,
			color-mix(in srgb, var(--primary-color) 1%, transparent) 0%,
			color-mix(in srgb, var(--primary-color) 90%, transparent) 50%,
			color-mix(in srgb, var(--primary-color) 1%, transparent) 100%,
			transparent 100%
		);
		border-radius: 0 0 30px 0;
	}
</style>
