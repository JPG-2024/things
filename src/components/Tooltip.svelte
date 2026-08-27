<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getContext, onMount } from 'svelte';
	import {
		calculatePopupPosition,
		type PopupPosition,
		type PopupPositionInput
	} from '@/lib/position';

	interface Props {
		content: string;
		position?: PopupPositionInput;
		children: Snippet;
	}

	export type TooltipProps = Props;

	let { content, position = 'bottom', children }: Props = $props();

	const menuCtx = getContext<{ open: boolean }>('popup-menu-open');

	let wrapperEl: HTMLDivElement;
	let tooltipEl: HTMLSpanElement;
	let isHovered = $state(false);
	let visible = $derived(isHovered && !!content && !(menuCtx?.open ?? false));
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
		if (!content) return;
		if (menuCtx?.open) return;
		updatePosition();
		isHovered = true;
	}

	function handleMouseLeave() {
		isHovered = false;
	}

	function handleMouseMove() {
		if (isHovered) updatePosition();
	}
</script>

<svelte:window onmousemove={handleMouseMove} />

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
	style="left: {tooltipX}px; top: {tooltipY}px;">{content}</span
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
		backdrop-filter: blur(8px);
		box-sizing: border-box;
		outline: none;
		border: none;
		border-radius: var(--radius-lg);
		background: white;

		color: rgba(21, 21, 21);
		padding: 0.4rem 0.7rem;
		font-size: 0.8rem;
		white-space: normal;
		z-index: 9999;
		pointer-events: none;
		max-width: 300px;
		overflow: hidden;
		text-overflow: ellipsis;
		transform: translate(-50%, -100%);
		margin-top: -8px;
		opacity: 0;
		transition: opacity 0.15s;
		word-wrap: break-word;
		font-weight: bold;
	}

	.tooltip.visible {
		opacity: 1;
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
