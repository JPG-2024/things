<script lang="ts">
	import type { Snippet } from 'svelte';
	import { setContext, tick } from 'svelte';
	import {
		calculatePopupPosition,
		type PopupPosition,
		type PopupPositionInput
	} from '@/lib/position';

	interface Props {
		position?: PopupPositionInput;
		trigger: Snippet;
		content: Snippet;
		open?: boolean;
	}

	let { position = 'bottom', trigger, content, open = $bindable(false) }: Props = $props();

	const popupCtx = $state({ open: false });
	$effect(() => {
		popupCtx.open = open;
	});
	setContext('popup-menu-open', popupCtx);

	let triggerEl: HTMLDivElement;
	let panelEl: HTMLDivElement | undefined;
	let panelX = $state(0);
	let panelY = $state(0);
	let effectivePosition = $state<PopupPosition>('bottom');

	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		return {
			destroy() {
				node.remove();
			}
		};
	}

	async function toggle(event: MouseEvent) {
		event.stopPropagation();
		open = !open;
		if (open) {
			await tick();
			updatePosition();
		}
	}

	function close() {
		open = false;
	}

	function updatePosition() {
		if (!triggerEl || !panelEl) return;
		const coords = calculatePopupPosition(
			triggerEl.getBoundingClientRect(),
			panelEl.offsetWidth,
			panelEl.offsetHeight,
			4,
			position
		);
		panelX = coords.x;
		panelY = coords.y;
		effectivePosition = coords.effectivePosition;
	}

	function handleClickOutside(event: MouseEvent) {
		const target = event.target as Node;
		if (triggerEl?.contains(target) || panelEl?.contains(target)) return;
		close();
	}

	function handleEscape(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			close();
		}
	}
</script>

<svelte:window onclick={handleClickOutside} onkeydown={handleEscape} />

<div bind:this={triggerEl} class="popup-menu-wrapper" onclick={toggle} role="button" tabindex="0">
	{@render trigger()}
</div>

{#if open}
	<div
		bind:this={panelEl}
		use:portal
		class="popup-menu panel-{effectivePosition}"
		style="left: {panelX}px; top: {panelY}px;"
		onmouseleave={close}
		role="menu"
	>
		{@render content()}
	</div>
{/if}

<style>
	.popup-menu-wrapper {
		display: inline-flex;
		cursor: pointer;
	}

	.popup-menu {
		position: fixed;
		backdrop-filter: blur(8px);
		box-sizing: border-box;
		outline: none;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
		background: rgba(21, 21, 21);
		color: var(--primary-color);
		padding: 1rem;
		font-size: 0.8rem;
		z-index: 9999;
		max-width: 600px;
		min-width: 120px;
		max-height: 500px;
		overflow: auto;
	}

	.panel-top {
		transform: translate(-50%, -100%);
	}

	.panel-bottom {
		transform: translate(-50%, 0);
	}

	.panel-left {
		transform: translate(-100%, -50%);
	}

	.panel-right {
		transform: translate(0, -50%);
	}
</style>
