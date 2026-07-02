<script lang="ts">
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';

	interface Props {
		content: string;
		position?: 'top' | 'bottom' | 'left' | 'right' | 'auto';
		children: Snippet;
	}

	let { content, position = 'bottom', children }: Props = $props();

	let wrapperEl: HTMLDivElement;
	let tooltipEl: HTMLSpanElement;
	let isHovered = $state(false);
	let tooltipX = $state(0);
	let tooltipY = $state(0);
	let effectivePosition = $state<'top' | 'bottom' | 'left' | 'right'>('bottom');

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
		const rect = wrapperEl.getBoundingClientRect();
		const tw = tooltipEl.offsetWidth;
		const th = tooltipEl.offsetHeight;
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const gap = 8;

		let pos: 'top' | 'bottom' | 'left' | 'right';

		if (position === 'auto') {
			const space = {
				top: rect.top - th - gap,
				bottom: vh - rect.bottom - th - gap,
				left: rect.left - tw - gap,
				right: vw - rect.right - tw - gap
			};
			pos = Object.entries(space).sort((a, b) => b[1] - a[1])[0][0] as
				| 'top'
				| 'bottom'
				| 'left'
				| 'right';
		} else {
			pos = position;
		}

		effectivePosition = pos;

		if (pos === 'top') {
			tooltipX = rect.left + rect.width / 2;
			tooltipY = rect.top - gap;
		} else if (pos === 'bottom') {
			tooltipX = rect.left + rect.width / 2;
			tooltipY = rect.bottom + gap;
		} else if (pos === 'left') {
			tooltipX = rect.left - gap;
			tooltipY = rect.top + rect.height / 2;
		} else {
			tooltipX = rect.right + gap;
			tooltipY = rect.top + rect.height / 2;
		}

		tooltipX = Math.max(tw / 2, Math.min(tooltipX, vw - tw / 2));
		tooltipY = Math.max(th, Math.min(tooltipY, vh));
	}

	function handleMouseEnter() {
		if (!content) return;
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
	class:visible={isHovered && content}
	style="left: {tooltipX}px; top: {tooltipY}px;">{content}</span
>

<style>
	.tooltip-wrapper {
		display: inline-flex;
		position: relative;
	}

	.tooltip {
		position: fixed;
		backdrop-filter: blur(8px);
		box-sizing: border-box;
		outline: none;
		border: none;
		border-radius: 12px;
		background: rgba(21, 21, 21, 0.9);
		color: var(--primary-color);
		padding: 0.4rem 0.7rem;
		font-size: 0.9rem;
		white-space: normal;
		z-index: 9999;
		pointer-events: none;
		max-width: 300px;
		min-width: 300px;
		overflow: hidden;
		text-overflow: ellipsis;
		transform: translate(-50%, -100%);
		margin-top: -8px;
		opacity: 0;
		transition: opacity 0.15s;
		word-wrap: break-word;
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
