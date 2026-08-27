<script lang="ts">
	import { fade, scale } from 'svelte/transition';
	import { createHotkey } from '@tanstack/svelte-hotkeys';
	import type { Snippet } from 'svelte';

	type Props = {
		show?: boolean;
		onClose: () => void;
		children?: Snippet;
	};

	let { show = false, onClose, children }: Props = $props();

	const handleClose = () => {
		onClose();
	};

	createHotkey('Escape', handleClose, {
		stopPropagation: true,
		preventDefault: true
	});
</script>

{#if show}
	<div
		class="backdrop"
		role="presentation"
		transition:fade={{ duration: 200 }}
		onclick={handleClose}
	>
		<div
			class="modal"
			role="dialog"
			transition:scale={{ start: 0.8, duration: 100 }}
			onclick={(e) => e.stopPropagation()}
		>
			<button class="close-btn" onclick={handleClose} aria-label="Close modal">×</button>
			<div class="modal-content">
				{@render children?.()}
			</div>
		</div>
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		display: flex;
		justify-content: center;
		align-items: center;
		background: rgba(0, 0, 0, 0.85);
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
		z-index: 9999;
	}

	.modal {
		position: relative;
		background: black;
		padding: 1.5rem;
		width: 90vw;
		height: fit-content;
		max-height: 90vh;
		overflow-y: auto;
		border-radius: var(--radius-md);
		z-index: 10000;
	}

	.modal-content {
		color: white;
	}

	.close-btn {
		position: absolute;
		top: 0.6rem;
		right: 1rem;
		background: none;
		border: none;
		font-size: 2rem;
		cursor: pointer;
		color: white;
		padding: 0;
		width: 2.5rem;
		height: 2.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-sm);
		transition: background-color 0.2s;
	}

	.close-btn:hover {
		background-color: rgba(255, 255, 255, 0.1);
	}
</style>
