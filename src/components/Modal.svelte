<script lang="ts">
	import { fade, scale } from 'svelte/transition';
	import { createHotkey } from '@tanstack/svelte-hotkeys';
	import type { Snippet } from 'svelte';

	type Props = {
		show?: boolean;
		onClose: () => void;
		/** Consumers with their own close affordance (chat) hide the corner ×. */
		showClose?: boolean;
		/** Consumers that own the Escape chain (chat closes its settings editor
		 * first) disable this so one keypress cannot close both. */
		closeOnEscape?: boolean;
		/** Accessible name for the dialog element. */
		ariaLabel?: string;
		/** Dialog that fills the available height (chat), keeping a 1.5rem
		 * margin on every side so a pinned footer lands near the viewport
		 * bottom instead of floating mid-screen. */
		fullHeight?: boolean;
		children?: Snippet;
	};

	let {
		show = false,
		onClose,
		showClose = true,
		closeOnEscape = true,
		ariaLabel,
		fullHeight = false,
		children
	}: Props = $props();

	const handleClose = () => {
		onClose();
	};

	createHotkey('Escape', handleClose, () => ({
		enabled: closeOnEscape,
		stopPropagation: true,
		preventDefault: true
	}));
</script>

{#if show}
	<div
		class="backdrop"
		class:backdrop--full={fullHeight}
		role="presentation"
		transition:fade={{ duration: 200 }}
		onclick={handleClose}
	>
		<div
			class="modal"
			class:modal--full={fullHeight}
			role="dialog"
			aria-label={ariaLabel}
			transition:scale={{ start: 0.8, duration: 100 }}
			onclick={(e) => e.stopPropagation()}
		>
			{#if showClose}
				<button class="close-btn" onclick={handleClose} aria-label="Close modal">×</button>
			{/if}
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
		align-items: flex-start;
		background: rgba(0, 0, 0, 0.9);
		z-index: 9999;
	}

	.modal {
		position: relative;
		background: black;
		width: 100vw;
		max-width: 1200px;
		height: 100vh;
		overflow-y: auto;
		border-radius: var(--radius-md);
		z-index: 10000;
		/* Lets descendant grids switch to @container rules based on the
		 * dialog's own width instead of the viewport. */
		container-type: inline-size;
	}

	/* Full-height dialog: the backdrop gains a 1.5rem frame and stretches the
	 * dialog, so a consumer with a pinned footer (chat) ends near the viewport
	 * bottom. `width: 100%` instead of `100vw` keeps the frame on narrow
	 * viewports, and the flex chain gives the content a definite height. */
	.backdrop--full {
		align-items: stretch;
	}

	.modal--full {
		display: flex;
		flex-direction: column;
		width: 100%;
		height: 100vh;
		/* Full-bleed content: the consumer owns its own padding, so the chat's
		 * header and input bar reach the dialog edges (the 1.5rem frame comes
		 * from `.backdrop--full`). */
		padding: 0;
		/* The consumer owns scrolling (chat scrolls its message list). */
		overflow: hidden;
	}

	.modal--full .modal-content {
		display: flex;
		flex-direction: column;
		flex: 1;
	}

	.modal-content {
		color: white;
	}

	.close-btn {
		position: absolute;
		top: 1rem;
		right: 1rem;
		background: none;
		border: none;
		font-size: 2rem;
		cursor: pointer;
		color: var(--bg-color);
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
