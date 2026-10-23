<script lang="ts">
	import type { Snippet } from 'svelte';
	import { setContext, tick } from 'svelte';
	import {
		calculatePopupPosition,
		type PopupPosition,
		type PopupPositionInput
	} from '@/lib/position';
	import Card from './Card.svelte';

	interface Props {
		position?: PopupPositionInput;
		/** Space in px between the trigger and the panel. */
		gap?: number;
		/** Wrapper without click-toggle: open is driven entirely by `bind:open`. */
		manual?: boolean;
		closeOnLeave?: boolean;
		trigger: Snippet;
		content: Snippet;
		open?: boolean;
		compact?: boolean;
	}

	let {
		position = 'bottom',
		gap = 4,
		manual = false,
		closeOnLeave = true,
		trigger,
		content,
		open = $bindable(false),
		compact = false
	}: Props = $props();

	const popupCtx = $state({ open: false });
	$effect(() => {
		popupCtx.open = open;
	});
	setContext('popup-menu-open', popupCtx);

	let triggerEl: HTMLDivElement;
	let panelEl = $state<HTMLDivElement | undefined>();
	let panelX = $state(0);
	let panelY = $state(0);
	let effectivePosition = $state<PopupPosition>('bottom');
	// Holds the panel invisible until its coordinates are measured, so the
	// first frame never flashes at the viewport origin.
	let positioned = $state(false);

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
	}

	function close() {
		open = false;
	}

	function updatePosition() {
		if (!triggerEl || !panelEl) return;
		const anchorRect = triggerEl.getBoundingClientRect();
		const coords = calculatePopupPosition(
			anchorRect,
			panelEl.offsetWidth,
			panelEl.offsetHeight,
			gap,
			position
		);
		panelX = coords.x;
		panelY = coords.y;
		effectivePosition = coords.effectivePosition;
	}

	// Positioning reacts to `open` from every path (manual bind, hotkey, typing),
	// not only the wrapper's own toggle — otherwise the panel renders at 0,0.
	$effect(() => {
		if (!open) {
			positioned = false;
			return;
		}
		void tick().then(() => {
			updatePosition();
			positioned = true;
		});
	});

	// Content can grow after the panel is measured (async lists arriving, chips,
	// buttons appearing) — re-anchor while open so it never sits misaligned.
	$effect(() => {
		if (!open || !panelEl) {
			return;
		}
		const observer = new ResizeObserver(updatePosition);
		observer.observe(panelEl);
		return () => observer.disconnect();
	});

	function handleResize() {
		if (open) updatePosition();
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

<svelte:window onclick={handleClickOutside} onkeydown={handleEscape} onresize={handleResize} />

<div
	bind:this={triggerEl}
	class="popup-menu-wrapper"
	class:manual
	onclick={manual ? undefined : toggle}
	role={manual ? undefined : 'button'}
	tabindex={manual ? undefined : 0}
>
	{@render trigger()}
</div>

{#if open}
	<div
		bind:this={panelEl}
		use:portal
		class="popup-menu panel-{effectivePosition}"
		class:compact
		style="left: {panelX}px; top: {panelY}px; visibility: {positioned ? 'visible' : 'hidden'};"
		onmouseleave={closeOnLeave ? close : undefined}
		role="menu"
	>
		<Card showBorders={true} solid>
			{@render content()}
		</Card>
	</div>
{/if}

<style>
	.popup-menu-wrapper {
		display: inline-flex;
		cursor: pointer;
	}

	.popup-menu-wrapper.manual {
		display: flex;
		width: 100%;
		gap: 0.3rem;
		cursor: default;
	}

	.popup-menu {
		position: fixed;
		box-sizing: border-box;
		outline: none;
		border-radius: var(--radius-md);
		color: var(--primary-color);
		font-size: 0.8rem;
		z-index: 9999;
		max-width: 600px;
		min-width: 70vw;
		max-height: 500px;
		box-shadow:
			0 18px 40px rgba(0, 0, 0, 0.75),
			0 50px 120px rgba(0, 0, 0, 0.7),
			0 0 160px rgba(0, 0, 0, 0.55);
	}

	.popup-menu > :global(.widget) {
		overflow: auto;
		max-height: inherit;
	}

	.popup-menu.compact {
		min-width: unset;
	}

	.popup-menu.compact > :global(.widget) {
		padding: 0.25rem;
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
