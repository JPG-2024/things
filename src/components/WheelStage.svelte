<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		width?: string;
		gap?: number;
		fadeEdges?: boolean;
		scrollSpeed?: number;
		keyboard?: boolean;
		label?: string;
		children: Snippet;
	}

	let {
		width = '100%',
		gap = 12,
		fadeEdges = true,
		scrollSpeed = 1,
		keyboard = false,
		label = 'Scrollable content',
		children
	}: Props = $props();

	function handleWheel(e: WheelEvent) {
		if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
		const el = e.currentTarget as HTMLDivElement;
		const max = el.scrollWidth - el.clientWidth;
		if (max <= 0) return;

		const delta = (e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY) * scrollSpeed;
		// Let the page scroll when the strip is already at the edge in that direction.
		const atStart = el.scrollLeft <= 0 && delta < 0;
		const atEnd = el.scrollLeft >= max - 1 && delta > 0;
		if (atStart || atEnd) return;

		el.scrollLeft += delta;
		e.preventDefault();
	}

	function handleKeydown(e: KeyboardEvent) {
		const el = e.currentTarget as HTMLDivElement;
		const step = el.clientWidth * 0.8;

		if (e.key === 'ArrowRight') {
			el.scrollLeft += step;
			e.preventDefault();
		} else if (e.key === 'ArrowLeft') {
			el.scrollLeft -= step;
			e.preventDefault();
		}
	}

	export function scrollChildIntoView(child: HTMLElement): void {
		child.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -- a scrollable region may take focus for keyboard scrolling -->
<div
	class="wheel-stage"
	class:fade-edges={fadeEdges}
	style="width: {width}; --stage-gap: {gap}px;"
	onwheel={handleWheel}
	role={keyboard ? 'region' : undefined}
	aria-label={keyboard ? label : undefined}
	tabindex={keyboard ? 0 : undefined}
	onkeydown={keyboard ? handleKeydown : undefined}
>
	<div class="stage-track">
		{@render children()}
	</div>
</div>

<style>
	.wheel-stage {
		position: relative;
		min-width: 0;
		overflow-x: auto;
		overflow-y: hidden;
		scroll-behavior: smooth;
		-webkit-overflow-scrolling: touch;
		scrollbar-width: none;
		box-sizing: border-box;
	}

	.wheel-stage::-webkit-scrollbar {
		display: none;
	}

	.wheel-stage:focus-visible {
		outline: 2px solid var(--primary-color);
		outline-offset: 2px;
		border-radius: var(--radius-sm);
	}

	.wheel-stage.fade-edges {
		-webkit-mask-image: linear-gradient(
			to right,
			transparent 0%,
			black 6%,
			black 94%,
			transparent 100%
		);
		mask-image: linear-gradient(to right, transparent 0%, black 6%, black 94%, transparent 100%);
	}

	.stage-track {
		display: flex;
		align-items: center;
		width: max-content;
		min-width: 100%;
		gap: var(--stage-gap);
		box-sizing: border-box;
	}
</style>
