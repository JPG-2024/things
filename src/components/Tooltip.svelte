<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getContext, onMount } from 'svelte';
	import {
		calculatePopupPosition,
		type PopupPosition,
		type PopupPositionInput
	} from '@/lib/position';

	interface Props {
		content?: string;
		contentSnippet?: Snippet;
		position?: PopupPositionInput;
		/** Render even while an ancestor PopupMenu is open (for popups whose own content wants tooltips). */
		ignoreMenuCtx?: boolean;
		children: Snippet;
	}

	export type TooltipProps = Props;

	let {
		content,
		contentSnippet,
		position = 'bottom',
		ignoreMenuCtx = false,
		children
	}: Props = $props();

	const menuCtx = getContext<{ open: boolean }>('popup-menu-open');

	let wrapperEl: HTMLDivElement;
	let tooltipEl: HTMLSpanElement;
	let isHovered = $state(false);
	let visible = $derived(
		isHovered && (!!content || !!contentSnippet) && (ignoreMenuCtx || !(menuCtx?.open ?? false))
	);
	let tooltipX = $state(0);
	let tooltipY = $state(0);
	let effectivePosition = $state<PopupPosition>('bottom');

	onMount(() => {
		if (tooltipEl && tooltipEl.parentElement !== document.body) {
			document.body.appendChild(tooltipEl);
		}
		return () => {
			if (tooltipEl && tooltipEl.parentElement === document.body) {
				document.body.removeChild(tooltipEl);
			}
		};
	});

	function updatePosition() {
		if (!wrapperEl || !tooltipEl) return;
		const coords = calculatePopupPosition(
			wrapperEl.getBoundingClientRect(),
			tooltipEl.offsetWidth,
			tooltipEl.offsetHeight,
			8,
			position
		);
		tooltipX = coords.x;
		tooltipY = coords.y;
		effectivePosition = coords.effectivePosition;
	}

	function handleMouseEnter() {
		if (!content && !contentSnippet) return;
		if (!ignoreMenuCtx && menuCtx?.open) return;
		updatePosition();
		isHovered = true;
	}

	function handleMouseLeave() {
		isHovered = false;
	}

	function handleMouseMove() {
		if (isHovered) updatePosition();
	}

	// The window listener only exists while the pointer is over the tooltip.
	// A wheel of entity cards mounts one Tooltip per thumbnail, so a listener
	// per instance multiplied the mousemove cost by the number of cards.
	// (`<svelte:window>` cannot be placed inside a block, so it is bound by
	// hand.)
	$effect(() => {
		if (!isHovered) return;
		const onMove = () => handleMouseMove();
		window.addEventListener('mousemove', onMove);
		return () => window.removeEventListener('mousemove', onMove);
	});
</script>

<div
	bind:this={wrapperEl}
	class="tooltip-wrapper"
	onmouseenter={handleMouseEnter}
	onmouseleave={handleMouseLeave}
	role="tooltip"
>
	{@render children()}
</div>

<span
	bind:this={tooltipEl}
	class="tooltip tooltip-{effectivePosition}"
	class:visible
	style="left: {tooltipX}px; top: {tooltipY}px;"
	>{#if contentSnippet}{@render contentSnippet()}{:else}{content}{/if}</span
>

<style>
	.tooltip-wrapper {
		/* display: inline-flex; */
		display: flex;
		align-items: center;
		position: relative;
		text-transform: capitalize;
	}

	.tooltip {
		position: fixed;
		box-sizing: border-box;
		outline: none;
		border: none;
		border-radius: var(--radius-sm);
		/* No backdrop-filter: the tooltip is portaled to `document.body`, so a
		   wheel of entity cards puts ~120 of these on the page at once and the
		   compositor re-blurs the backdrop on every frame. */
		background: rgba(0, 0, 0, 0.92);

		color: var(--gray-100);
		padding: 0.4rem 0.7rem;
		font-family: var(--font-secondary);
		font-size: 0.8rem;
		white-space: pre-wrap;
		z-index: 9999;
		pointer-events: none;
		max-width: 600px;
		overflow: hidden;
		text-overflow: ellipsis;
		transform: translate(-50%, -100%);
		margin-top: -8px;
		opacity: 0;
		/* Hidden means "not painted": the element stays in the DOM (the body
		   portal depends on it) but costs no layer and no compositing work. */
		visibility: hidden;
		transition:
			opacity 0.15s,
			visibility 0.15s;
		word-wrap: break-word;
		font-weight: bold;
	}

	.tooltip.visible {
		opacity: 1;
		visibility: visible;
	}

	.tooltip-bottom {
		transform: translate(-50%, 0);
		margin-top: 8px;
	}

	.tooltip-left {
		transform: translate(-100%, -50%);
		margin-left: -8px;
	}

	.tooltip-right {
		transform: translate(0, -50%);
		margin-left: 8px;
	}
</style>
