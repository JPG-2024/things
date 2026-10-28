<script lang="ts">
	import type { Snippet } from 'svelte';
	import { WHEEL_FADE_WIDTH } from '@/constants';

	interface Props {
		width?: string;
		/** Track height (any CSS length). */
		height?: string;
		gap?: number;
		/** Vertical gap between rows in the same column. Defaults to `gap`. */
		rowGap?: number;
		/** Items stacked vertically inside a single column. */
		rows?: number;
		fadeEdges?: boolean;
		/**
		 * Color the edge fade fades into (any CSS color). It must match the
		 * background behind the strip: the fade is an overlay, so it paints
		 * the color instead of revealing what is underneath.
		 */
		fadeColor?: string;
		/**
		 * Fades the edges with a mask on the scroller instead of an overlay.
		 * The mask reveals the real background, but it is recomputed over the
		 * whole track on every frame, so it is only worth it on small strips.
		 */
		fadeWithMask?: boolean;
		scrollSpeed?: number;
		keyboard?: boolean;
		label?: string;
		/** Blank space added to both ends of the track (any CSS length). */
		edgeSpace?: string;
		/**
		 * Blank space before the first item (any CSS length). Fallback:
		 * `edgeSpace`. Gives the wheel a fake-scroll runway at the start.
		 */
		startSpace?: string;
		/**
		 * Blank space after the last item (any CSS length). Fallback:
		 * `edgeSpace`. Sized so the last cards can be brought near the center
		 * of the viewport.
		 */
		endSpace?: string;
		/**
		 * Number of columns of the track. When set, the track declares an
		 * explicit column template, so every column keeps its slot even when
		 * no card is mounted in it (the list can be virtualized without the
		 * scroll geometry moving).
		 */
		trackColumns?: number;
		/** Width of every column of the track (any CSS length). */
		trackColumnWidth?: string;
		/**
		 * Reports the geometry of the scroll port: the scroll offset, the
		 * visible width and the left padding of the track. A list uses it to
		 * know which part of the track is visible (and to virtualize it).
		 */
		onGeometryChange?: (geometry: {
			scrollLeft: number;
			clientWidth: number;
			paddingStart: number;
		}) => void;
		children: Snippet;
	}

	let {
		width = '100%',
		height = 'auto',
		gap = 12,
		rowGap = 12,
		rows = 1,
		fadeEdges = true,
		fadeColor = 'rgb(0, 0, 0)',
		fadeWithMask = false,
		scrollSpeed = 1,
		keyboard = false,
		label = 'Scrollable content',
		edgeSpace = '0px',
		startSpace = undefined,
		endSpace = undefined,
		trackColumns = undefined,
		trackColumnWidth = undefined,
		onGeometryChange = undefined,
		children
	}: Props = $props();

	const spaceStart = $derived(startSpace ?? edgeSpace);
	const spaceEnd = $derived(endSpace ?? edgeSpace);
	const hasFixedColumns = $derived(trackColumns !== undefined && trackColumns > 0);

	let stageEl: HTMLDivElement | undefined = $state.raw();
	let trackEl: HTMLDivElement | undefined = $state.raw();
	let scrollFrame = 0;

	// Geometry of the scroll port, published to the parent.
	let scrollLeft = $state(0);
	let clientWidth = $state(0);
	let paddingStart = $state(0);

	$effect(() => {
		onGeometryChange?.({ scrollLeft, clientWidth, paddingStart });
	});

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

		// Instant scroll: with `scroll-behavior: smooth` every wheel tick
		// re-targeted the animation, so the strip moved in visible jumps.
		el.scrollBy({ left: delta, behavior: 'auto' });
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

	/**
	 * Publishes the scroll offset once per frame: a scroll event fires far
	 * more often than the wheel can be painted, and every update re-renders
	 * the (virtualized) list.
	 */
	function handleScroll() {
		if (scrollFrame) return;
		scrollFrame = requestAnimationFrame(() => {
			scrollFrame = 0;
			scrollLeft = stageEl?.scrollLeft ?? 0;
		});
	}

	$effect(() => {
		const el = stageEl;
		if (!el) return;

		const update = () => {
			clientWidth = el.clientWidth;
		};
		update();

		const observer = new ResizeObserver(update);
		observer.observe(el);
		return () => observer.disconnect();
	});

	$effect(() => {
		const el = trackEl;
		if (!el) return;

		const update = () => {
			paddingStart = parseFloat(getComputedStyle(el).paddingInlineStart) || 0;
		};
		update();

		const observer = new ResizeObserver(update);
		observer.observe(el);
		// The runway is expressed in `vw`, so it changes with the window even
		// when the track keeps its width (the observer would not fire).
		window.addEventListener('resize', update);
		return () => {
			observer.disconnect();
			window.removeEventListener('resize', update);
		};
	});

	$effect(() => {
		return () => {
			if (scrollFrame) cancelAnimationFrame(scrollFrame);
		};
	});

	export function scrollChildIntoView(child: HTMLElement): void {
		child.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
	}
</script>

<div
	class="wheel-stage-shell"
	class:fade-edges={fadeEdges}
	class:masked-fade={fadeWithMask}
	style="--wheel-fade-width: {WHEEL_FADE_WIDTH}; --wheel-fade-color: {fadeColor};"
>
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -- a scrollable region may take focus for keyboard scrolling -->
	<div
		class="wheel-stage"
		bind:this={stageEl}
		style="width: {width}; height: {height}; --stage-gap: {gap}px; --stage-row-gap: {rowGap}px; --stage-rows: {rows}; --stage-space-start: {spaceStart}; --stage-space-end: {spaceEnd}; --stage-track-columns: {trackColumns ??
			0}; --stage-track-column-width: {trackColumnWidth ?? 'auto'};"
		onwheel={handleWheel}
		onscroll={handleScroll}
		role={keyboard ? 'region' : undefined}
		aria-label={keyboard ? label : undefined}
		tabindex={keyboard ? 0 : undefined}
		onkeydown={keyboard ? handleKeydown : undefined}
	>
		<div class="stage-track" bind:this={trackEl} class:fixed-columns={hasFixedColumns}>
			{@render children()}
		</div>
	</div>
	<!-- The edge fade is an overlay, not a mask on the scroller: a mask is
	     recomputed over the whole (max-content) track on every frame. -->
	<div class="wheel-fade wheel-fade--start" aria-hidden="true"></div>
	<div class="wheel-fade wheel-fade--end" aria-hidden="true"></div>
</div>

<style>
	.wheel-stage-shell {
		position: relative;
		width: 100%;
		min-width: 0;
	}

	.wheel-stage {
		position: relative;
		min-width: 0;
		overflow-x: auto;
		overflow-y: hidden;
		/* No `scroll-behavior: smooth` here: it re-targeted the animation on
		   every wheel tick, so the strip moved in jumps. Programmatic scrolls
		   that want easing ask for it explicitly (see scrollChildIntoView). */
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

	.wheel-fade {
		position: absolute;
		top: 0;
		bottom: 0;
		width: var(--wheel-fade-width, 8%);
		pointer-events: none;
		z-index: 2;
	}

	.wheel-stage-shell:not(.fade-edges) .wheel-fade {
		display: none;
	}

	/* The dashboard background behind the wheel is the top of the viewport
	   gradient, which is black (see `main::before` in +layout.svelte). */
	.wheel-fade--start {
		left: 0;
		background: linear-gradient(to right, var(--wheel-fade-color, rgb(0, 0, 0)), transparent);
	}

	.wheel-fade--end {
		right: 0;
		background: linear-gradient(to left, var(--wheel-fade-color, rgb(0, 0, 0)), transparent);
	}

	/* Small strips keep the mask: it reveals the real background, which the
	   overlay cannot do without knowing its color. */
	.wheel-stage-shell.masked-fade .wheel-fade {
		display: none;
	}

	.wheel-stage-shell.masked-fade .wheel-stage {
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
		display: grid;
		grid-auto-flow: column;
		grid-template-rows: repeat(var(--stage-rows, 1), auto);
		grid-auto-columns: max-content;
		align-items: center;
		width: max-content;
		min-width: 100%;
		column-gap: var(--stage-gap);
		row-gap: var(--stage-row-gap, var(--stage-gap));
		padding-inline-start: var(--stage-space-start, 0px);
		padding-inline-end: var(--stage-space-end, 0px);
		box-sizing: border-box;
	}

	/* Fixed-column mode: every column exists in the template even when it
	   holds no card, so the scroll geometry does not depend on how many cards
	   are mounted. */
	.stage-track.fixed-columns {
		grid-template-columns: repeat(var(--stage-track-columns), var(--stage-track-column-width));
		grid-auto-columns: var(--stage-track-column-width);
		grid-auto-flow: row;
	}
</style>
