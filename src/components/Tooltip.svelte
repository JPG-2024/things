<script lang="ts">
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';

	interface Props {
		content: string;
		position?: 'top' | 'bottom' | 'left' | 'right';
		children: Snippet;
	}

	let { content, position = 'top', children }: Props = $props();

	let wrapperEl: HTMLDivElement;
	let tooltipEl: HTMLSpanElement;
	let isHovered = $state(false);
	let tooltipX = $state(0);
	let tooltipY = $state(0);

	onMount(() => {
		if (tooltipEl && tooltipEl.parentElement !== document.body) {
			document.body.appendChild(tooltipEl);
		}
	});

	function updatePosition() {
		if (!wrapperEl) return;
		const rect = wrapperEl.getBoundingClientRect();
		tooltipX = rect.left + rect.width / 2;
		tooltipY =
			position === 'top'
				? rect.top
				: position === 'bottom'
					? rect.bottom
					: rect.top + rect.height / 2;
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
	class="tooltip tooltip-{position}"
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
		background: rgba(0, 0, 0, 0.9);
		color: white;
		padding: 0.4rem 0.7rem;
		border-radius: 0.35rem;
		font-size: 0.75rem;
		white-space: normal;
		z-index: 9999;
		pointer-events: none;
		max-width: 350px;
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
