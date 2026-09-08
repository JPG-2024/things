<script module lang="ts">
	export type LayoutKey = 'row' | 'grid-3' | 'grid-2';

	export interface LayoutConfig {
		columns: number;
		padding: string;
		rowHeight?: number;
		key: LayoutKey;
	}
</script>

<script lang="ts" generics="T extends object">
	import type { Snippet } from 'svelte';
	import Icon from '@/components/Icon.svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import { onMount, tick } from 'svelte';
	import { scale } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { createHotkey } from '@tanstack/svelte-hotkeys';

	interface Props {
		items: T[];
		keyOf?: (item: T) => string;
		children: Snippet<[T, number, number, LayoutKey]>;
		headerLeft?: Snippet<[]>;
		layoutIndex?: number;
		onLayoutIndexChange?: (value: number) => void;
		columnOffset?: number;
		onColumnOffsetChange?: (value: number) => void;
		fixedColumns?: number;
		spanOf?: (item: T) => 1 | 2;
	}

	let {
		items,
		keyOf = (item: T) => (item as { url?: string | null }).url ?? '',
		children,
		headerLeft,
		layoutIndex: layoutIndexProp,
		onLayoutIndexChange,
		columnOffset: columnOffsetProp,
		onColumnOffsetChange,
		fixedColumns,
		spanOf
	}: Props = $props();

	// Mirror of `items` that is filled after mount. Svelte suppresses intro
	// transitions for elements present during a component's initial render, so a
	// grid whose `items` are already populated at mount (e.g. cached data) would
	// never animate. Starting empty and populating in the post-mount effect makes
	// the keyed {#each} see an add, so items fade/scale in on every mount.
	let renderedItems = $state<T[]>([]);

	let gridEl: HTMLDivElement;
	let resizeObservers: ResizeObserver[] = [];
	let containerObserver: ResizeObserver | null = null;
	let pendingCleanups: (() => void)[] = [];
	let mutationObserver: MutationObserver | null = null;
	let resizeDirty = false;
	let rafId = 0;
	let fontsReadyDone = false;
	let resizeGeneration = 0;
	let lastSpans = new WeakMap<HTMLDivElement, number>();

	// px of slack required before an item is allowed to shrink a span;
	// prevents subpixel measurement noise from oscillating spans (flicker)
	const SHRINK_TOLERANCE = 1;

	let layoutIndex = $derived(layoutIndexProp ?? viewState.masonryArticlesLayoutIndex);
	let columnOffset = $derived(columnOffsetProp ?? viewState.masonryArticlesColumnOffset);

	// measured content-box width of the grid container; drives responsive columns
	let containerWidth = $state(0);

	// min column width (px) and hard cap; the grid fills its container (full viewport
	// width) and the column count scales with it, up to MAX_COLUMNS
	const MIN_COLUMN_WIDTH = 280;
	const MIN_COLUMNS = 1;
	const MAX_COLUMNS = 6;

	const layouts: LayoutConfig[] = [
		{ columns: 1, padding: '0.6rem', rowHeight: 50, key: 'row' },
		{ columns: 3, padding: '2rem 3rem', key: 'grid-3' },
		{ columns: 2, padding: '1rem 2rem', key: 'grid-2' }
	];

	let currentLayout = $derived(layouts[layoutIndex] ?? layouts[1]);

	const baseColumns = $derived(
		containerWidth > 0
			? Math.max(MIN_COLUMNS, Math.min(MAX_COLUMNS, Math.floor(containerWidth / MIN_COLUMN_WIDTH)))
			: MIN_COLUMNS
	);

	// grid modes get responsive columns nudged by the manual density offset;
	// row mode is always a single column. A fixedColumns prop overrides the
	// responsive calculation entirely (e.g. tabs that should never reflow).
	const effectiveColumns = $derived(
		fixedColumns
			? fixedColumns
			: layoutIndex === 0
				? 1
				: Math.max(MIN_COLUMNS, Math.min(MAX_COLUMNS, baseColumns + columnOffset))
	);

	function setLayoutIndex(value: number) {
		const next = Math.max(0, Math.min(value, layouts.length - 1));
		if (next === layoutIndex) return;
		if (onLayoutIndexChange) onLayoutIndexChange(next);
		else viewState.masonryArticlesLayoutIndex = next;
	}

	function toggleRowMode() {
		setLayoutIndex(layoutIndex === 0 ? 1 : 0);
	}

	function setColumnOffset(value: number) {
		const minOffset = MIN_COLUMNS - baseColumns;
		const maxOffset = MAX_COLUMNS - baseColumns;
		const next = Math.max(minOffset, Math.min(value, maxOffset));
		if (next === columnOffset) return;
		if (onColumnOffsetChange) onColumnOffsetChange(next);
		else viewState.masonryArticlesColumnOffset = next;
	}

	function decreaseLayout() {
		setColumnOffset(columnOffset - 1);
	}

	function increaseLayout() {
		setColumnOffset(columnOffset + 1);
	}

	// column density hotkeys. '+' is the Shift+= key (the + key sets shiftKey=true),
	// expressed as a RawHotkey since the typed Hotkey literal forbids Shift+Punctuation.
	// '-' is Minus (unshifted). Shift+Arrow nudges density too.
	createHotkey({ key: '=', shift: true }, increaseLayout, { ignoreInputs: true });
	createHotkey('-', decreaseLayout, { ignoreInputs: true });
	createHotkey('Shift+ArrowLeft', decreaseLayout, { ignoreInputs: true, preventDefault: true });
	createHotkey('Shift+ArrowRight', increaseLayout, { ignoreInputs: true, preventDefault: true });

	function getRowMetrics() {
		const computed = window.getComputedStyle(gridEl);
		const rowHeight = Number.parseFloat(computed.getPropertyValue('grid-auto-rows'));
		const rowGap = Number.parseFloat(computed.getPropertyValue('row-gap'));
		return { rowHeight, rowGap };
	}

	function setRowSpan(wrapper: HTMLDivElement, rowSpan: number) {
		const next = `span ${rowSpan}`;
		if (wrapper.style.gridRowEnd !== next) wrapper.style.gridRowEnd = next;
		lastSpans.set(wrapper, rowSpan);
	}

	function computeRowSpan(
		wrapper: HTMLDivElement,
		contentHeight: number,
		rowHeight: number,
		rowGap: number
	): number {
		const unit = rowHeight + rowGap;
		if (!Number.isFinite(unit) || unit <= 0) return 1;
		const exact = Math.max(1, Math.ceil((contentHeight + rowGap) / unit));
		const prev = lastSpans.get(wrapper) ?? 0;
		if (prev > exact) {
			// only shrink when the smaller span still fits with tolerance
			const fitsWithTolerance = exact * unit - rowGap >= contentHeight + SHRINK_TOLERANCE;
			return fitsWithTolerance ? exact : prev;
		}
		return exact;
	}

	function resizeGridItem(wrapper: HTMLDivElement) {
		if (!gridEl || !wrapper?.isConnected) return;
		if (currentLayout.rowHeight) {
			setRowSpan(wrapper, 1);
			return;
		}
		const content = wrapper.querySelector('.content') as HTMLElement | null;
		if (!content) return;

		const { rowHeight, rowGap } = getRowMetrics();
		const contentHeight = content.getBoundingClientRect().height;
		setRowSpan(wrapper, computeRowSpan(wrapper, contentHeight, rowHeight, rowGap));
	}

	function resizeAll() {
		if (!gridEl?.isConnected) return;

		const wrappers = getWrappers();

		if (currentLayout.rowHeight) {
			for (const wrapper of wrappers) {
				if (wrapper?.isConnected) setRowSpan(wrapper, 1);
			}
			return;
		}

		const { rowHeight, rowGap } = getRowMetrics();
		const measured: { wrapper: HTMLDivElement; contentHeight: number }[] = [];

		// read phase: all measurements before any writes to avoid layout thrashing
		for (const wrapper of wrappers) {
			if (!wrapper?.isConnected) continue;
			const content = wrapper.querySelector('.content') as HTMLElement | null;
			if (!content) continue;
			measured.push({ wrapper, contentHeight: content.getBoundingClientRect().height });
		}

		// write phase
		for (const { wrapper, contentHeight } of measured) {
			setRowSpan(wrapper, computeRowSpan(wrapper, contentHeight, rowHeight, rowGap));
		}
	}

	// Live collection of item wrappers queried from the DOM. We intentionally
	// avoid index-bound tracking (e.g. bind:this on an array) so that items
	// mid-exit-transition — which Svelte keeps in the DOM — never corrupt the
	// element mapping used by the span-measurement observers.
	function getWrappers(): HTMLDivElement[] {
		if (!gridEl?.isConnected) return [];
		return Array.from(gridEl.querySelectorAll<HTMLDivElement>('.grid-item'));
	}

	const prefersReducedMotion = () =>
		typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	// Subtle fade + scale used when items enter or leave the list. Becomes a
	// no-op when the user prefers reduced motion.
	function enterLeave(node: Element, { duration = 200 }: { duration?: number } = {}) {
		if (prefersReducedMotion()) return {};
		return scale(node, { duration, start: 0.96, opacity: 0, easing: cubicOut });
	}

	function observeAll() {
		resizeObservers.forEach((obs) => obs.disconnect());
		resizeObservers = [];
		// spans from a previous items/layout state must not feed hysteresis
		lastSpans = new WeakMap();
		for (const wrapper of getWrappers()) {
			if (!wrapper?.isConnected) continue;
			const content = wrapper.querySelector('.content') as HTMLElement;
			const observer = new ResizeObserver(() => resizeGridItem(wrapper));
			if (content) observer.observe(content);
			resizeObservers.push(observer);
		}
	}

	function cleanupPending() {
		pendingCleanups.forEach((fn) => fn());
		pendingCleanups = [];
	}

	function scheduleResize() {
		const generation = ++resizeGeneration;
		cleanupPending();

		let finished = false;
		const finish = () => {
			if (finished || generation !== resizeGeneration) return;
			finished = true;
			cleanupPending();
			resizeAll();
		};

		const firstFrame = requestAnimationFrame(() => {
			if (generation !== resizeGeneration) return;
			resizeAll();

			const secondFrame = requestAnimationFrame(() => {
				if (generation !== resizeGeneration) return;
				resizeAll();
			});
			pendingCleanups.push(() => cancelAnimationFrame(secondFrame));
		});
		pendingCleanups.push(() => cancelAnimationFrame(firstFrame));

		const images: HTMLImageElement[] = [];
		for (const wrapper of getWrappers()) {
			if (!wrapper?.isConnected) continue;
			for (const img of wrapper.querySelectorAll<HTMLImageElement>('.content img')) {
				if (!img.complete) images.push(img);
			}
		}

		if (images.length > 0) {
			let remainingImages = images.length;

			for (const img of images) {
				const onDone = () => {
					remainingImages -= 1;
					if (remainingImages === 0) finish();
				};
				img.addEventListener('load', onDone, { once: true });
				img.addEventListener('error', onDone, { once: true });
				pendingCleanups.push(() => {
					img.removeEventListener('load', onDone);
					img.removeEventListener('error', onDone);
				});
			}

			const imageTimer = setTimeout(finish, 1500);
			pendingCleanups.push(() => clearTimeout(imageTimer));
		}

		const settleTimer = setTimeout(() => {
			if (generation !== resizeGeneration) return;
			resizeAll();
			if (images.length === 0) finish();
		}, 250);
		pendingCleanups.push(() => clearTimeout(settleTimer));

		if (!fontsReadyDone) {
			fontsReadyDone = true;
			void document.fonts.ready.then(() => {
				if (generation === resizeGeneration) resizeAll();
			});
		}
	}

	onMount(() => {
		window.addEventListener('resize', scheduleResize);

		if (gridEl?.isConnected) containerWidth = gridEl.clientWidth;
		containerObserver = new ResizeObserver(() => {
			if (gridEl?.isConnected) containerWidth = gridEl.clientWidth;
		});
		if (gridEl) containerObserver.observe(gridEl);

		mutationObserver = new MutationObserver(() => {
			if (resizeDirty) return;
			resizeDirty = true;
			rafId = requestAnimationFrame(() => {
				resizeDirty = false;
				scheduleResize();
			});
		});
		mutationObserver.observe(gridEl, { childList: true, subtree: true });

		return () => {
			resizeObservers.forEach((obs) => obs.disconnect());
			containerObserver?.disconnect();
			mutationObserver?.disconnect();
			cleanupPending();
			resizeGeneration += 1;
			window.removeEventListener('resize', scheduleResize);
			cancelAnimationFrame(rafId);
		};
	});

	$effect(() => {
		renderedItems = items;
		void currentLayout;
		tick().then(() => {
			observeAll();
			scheduleResize();
		});
	});
</script>

<div class="masonry-container">
	<div class="layout-header">
		{#if headerLeft}
			{@render headerLeft()}
		{/if}
		<Icon
			name={layoutIndex === 0 ? 'LayoutGrid' : 'List'}
			size={22}
			onClick={toggleRowMode}
			tooltipProps={{ content: layoutIndex === 0 ? 'Show grid' : 'Show list' }}
		/>
		{#if !fixedColumns}
			<Icon name="Minus" size={20} onClick={decreaseLayout} />
			<Icon name="Plus" size={20} onClick={increaseLayout} />
		{/if}
	</div>
	<div
		class="masonry-grid"
		bind:this={gridEl}
		style:grid-template-columns={`repeat(${effectiveColumns}, 1fr)`}
		style:grid-auto-rows={currentLayout.rowHeight ? `${currentLayout.rowHeight}px` : '1px'}
		style:gap={currentLayout.padding}
		style:padding-bottom={currentLayout.padding}
		class:fixed-row-layout={currentLayout.rowHeight !== undefined}
	>
		{#each renderedItems as item, i (keyOf(item))}
			<div
				class="grid-item"
				class:span-full={(spanOf?.(item) ?? 1) === 2}
				in:enterLeave
				out:enterLeave
			>
				<div class="content">
					{@render children(item, i, layoutIndex, currentLayout.key)}
				</div>
			</div>
		{/each}
	</div>
</div>

<style>
	.masonry-container {
		width: 100hw;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.layout-header {
		display: flex;
		justify-content: flex-end;
		gap: 2rem;
		padding: 2rem 0;
		width: 100%;
	}

	.masonry-grid {
		display: grid;
		width: 100%;
		grid-auto-flow: dense;
	}

	.grid-item {
		display: flex;
		align-items: center;
		min-width: 150px;
		overflow: hidden;
		border-radius: var(--radius-sm);
	}

	.grid-item.span-full {
		grid-column: 1 / -1;
	}

	.content {
		width: 100%;
		min-width: 0;
	}

	.masonry-grid:not(.fixed-row-layout) .grid-item,
	.masonry-grid:not(.fixed-row-layout) .content {
		height: max-content;
	}

	.masonry-grid:not(.fixed-row-layout) :global(.widget) {
		height: auto;
		max-height: none;
	}
</style>
