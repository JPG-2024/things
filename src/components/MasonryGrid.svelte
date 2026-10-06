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
	import type { ArticleContentMode } from '@/stores/viewStore.svelte';
	import { onMount, tick } from 'svelte';
	import { scale } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { createHotkey } from '@tanstack/svelte-hotkeys';
	import type { ItemTransition } from '@/lib/utils/itemTransitions';

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
		showContentModeToggle?: boolean;
		itemTransition?: ItemTransition;
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
		spanOf,
		showContentModeToggle = false,
		itemTransition = enterLeave
	}: Props = $props();

	// Mirror of `items` that is filled after mount. Svelte suppresses intro
	// transitions for elements present during a component's initial render, so a
	// grid whose `items` are already populated at mount (e.g. cached data) would
	// never animate. Starting empty and populating in the post-mount effect makes
	// the keyed {#each} see an add, so items fade/scale in on every mount.
	let renderedItems = $state<T[]>([]);

	let gridEl: HTMLDivElement;
	let contentObserver: ResizeObserver | null = null;
	let containerObserver: ResizeObserver | null = null;
	let pendingCleanups: (() => void)[] = [];
	let resizeQueued = false;
	let resizeRafId = 0;
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
	const MIN_COLUMNS = 2;
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

	const CONTENT_MODES: ArticleContentMode[] = ['both', 'thumbnail', 'title'];

	const contentModeIcon: Record<ArticleContentMode, string> = {
		both: 'LayoutPanelTop',
		thumbnail: 'Image',
		title: 'Type'
	};

	const contentModeTooltip: Record<ArticleContentMode, string> = {
		both: 'Content: images + text (click for images only)',
		thumbnail: 'Content: images only (click for text only)',
		title: 'Content: text only (click for images + text)'
	};

	function cycleContentMode() {
		const index = CONTENT_MODES.indexOf(viewState.masonryArticlesContentMode);
		viewState.masonryArticlesContentMode = CONTENT_MODES[(index + 1) % CONTENT_MODES.length];
	}

	// column density hotkeys. '+' is the Shift+= key (the + key sets shiftKey=true),
	// expressed as a RawHotkey since the typed Hotkey literal forbids Shift+Punctuation.
	// '-' is Minus (unshifted). Shift+Arrow nudges density too.
	createHotkey({ key: '=', shift: true }, increaseLayout, { ignoreInputs: true });
	createHotkey('-', decreaseLayout, { ignoreInputs: true });
	createHotkey('Shift+ArrowLeft', decreaseLayout, { ignoreInputs: true, preventDefault: true });
	createHotkey('Shift+ArrowRight', increaseLayout, { ignoreInputs: true, preventDefault: true });

	// 'V' cycles the article content mode (both / images only / text only) for
	// grids that opted into the toolbar toggle.
	createHotkey('V', cycleContentMode, () => ({
		enabled: showContentModeToggle,
		ignoreInputs: true
	}));

	// Computed row metrics are a pure function of the active layout, but reading
	// them costs a getComputedStyle() forced style recalc, and resizeAll() runs
	// several times per cycle (two rAFs, the settle timer, fonts.ready, finish()).
	// Cache them and re-read only when the layout object changes or the window
	// resizes — zoom alters the rem-based grid gap without changing the layout.
	let rowMetricsKey: LayoutConfig | null = null;
	let rowMetricsValue = { rowHeight: 0, rowGap: 0 };

	function getRowMetrics() {
		if (rowMetricsKey === currentLayout) return rowMetricsValue;
		const computed = window.getComputedStyle(gridEl);
		rowMetricsValue = {
			rowHeight: Number.parseFloat(computed.getPropertyValue('grid-auto-rows')),
			rowGap: Number.parseFloat(computed.getPropertyValue('row-gap'))
		};
		rowMetricsKey = currentLayout;
		return rowMetricsValue;
	}

	function handleWindowResize() {
		rowMetricsKey = null;
		scheduleResize();
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

	// Scratch buffer reused across measurement passes. resizeAll() runs several
	// times per cycle, so allocating an array plus one object per item each time
	// churned GC on large grids. It is resized to the live item count at the end
	// of each pass, which also drops references to any detached grid items.
	type MeasuredItem = { wrapper: HTMLDivElement; contentHeight: number };
	const measured: MeasuredItem[] = [];

	function resizeAll() {
		if (!gridEl?.isConnected) return;

		const wrappers = getWrappers();

		if (currentLayout.rowHeight) {
			for (const wrapper of wrappers) {
				if (wrapper?.isConnected) setRowSpan(wrapper, 1);
			}
			// row mode does not use the scratch buffer; drop any stale entries so
			// detached grid items (and their images) are not retained
			measured.length = 0;
			return;
		}

		const { rowHeight, rowGap } = getRowMetrics();

		// read phase: all measurements before any writes to avoid layout thrashing
		let count = 0;
		for (const wrapper of wrappers) {
			if (!wrapper?.isConnected) continue;
			const content = wrapper.querySelector('.content') as HTMLElement | null;
			if (!content) continue;
			let slot = measured[count];
			if (slot === undefined) {
				slot = { wrapper, contentHeight: 0 };
				measured[count] = slot;
			}
			slot.wrapper = wrapper;
			slot.contentHeight = content.getBoundingClientRect().height;
			count += 1;
		}

		// write phase
		for (let i = 0; i < count; i++) {
			const slot = measured[i];
			setRowSpan(slot.wrapper, computeRowSpan(slot.wrapper, slot.contentHeight, rowHeight, rowGap));
		}

		measured.length = count;
	}

	// Live collection of item wrappers queried from the DOM. We intentionally
	// avoid index-bound tracking (e.g. bind:this on an array) so that items
	// mid-exit-transition — which Svelte keeps in the DOM — never corrupt the
	// element mapping used by the span-measurement observers.
	function getWrappers(): HTMLDivElement[] {
		if (!gridEl?.isConnected) return [];
		return Array.from(gridEl.querySelectorAll<HTMLDivElement>('.grid-item'));
	}

	// Allocated once per component (not per item) and read live, so a mid-session
	// change to the OS setting is still honoured by the next transition.
	const reducedMotionQuery =
		typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

	const prefersReducedMotion = (): boolean => reducedMotionQuery?.matches ?? false;

	// Subtle fade + scale used when items enter or leave the list. Becomes a
	// no-op when the user prefers reduced motion.
	function enterLeave(node: Element, { duration = 200 }: { duration?: number } = {}) {
		if (prefersReducedMotion()) return {};
		return scale(node, { duration, start: 0.96, opacity: 0, easing: cubicOut });
	}

	// A single ResizeObserver tracks every item's content box. Browsers already
	// batch callback invocations for all observed elements into one frame, so one
	// shared observer is equivalent to N per-item observers while avoiding N
	// allocations per observeAll() and N separate callback invocations.
	function getContentObserver(): ResizeObserver {
		if (!contentObserver) {
			contentObserver = new ResizeObserver(() => scheduleResize());
		}
		return contentObserver;
	}

	function observeAll() {
		const observer = getContentObserver();
		observer.disconnect();
		// spans from a previous items/layout state must not feed hysteresis
		lastSpans = new WeakMap();
		for (const wrapper of getWrappers()) {
			if (!wrapper?.isConnected) continue;
			const content = wrapper.querySelector('.content') as HTMLElement | null;
			if (content) observer.observe(content);
		}
	}

	function cleanupPending() {
		pendingCleanups.forEach((fn) => fn());
		pendingCleanups = [];
	}

	// Coalesce bursts of resize signals into a single measurement pass per frame.
	// A batch of image loads makes the shared observer deliver all of its entries
	// at once, and window-resize / mutation events can also arrive in bursts.
	// Without this guard, each signal ran the full O(N) scan below, so N signals
	// meant N passes of which all but the last were discarded by the generation
	// check — quadratic work for a single visual update.
	function scheduleResize() {
		if (resizeQueued) return;
		resizeQueued = true;
		resizeRafId = requestAnimationFrame(() => {
			resizeQueued = false;
			runResize();
		});
	}

	function runResize() {
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
		window.addEventListener('resize', handleWindowResize);

		if (gridEl?.isConnected) containerWidth = gridEl.clientWidth;
		containerObserver = new ResizeObserver(() => {
			if (gridEl?.isConnected) containerWidth = gridEl.clientWidth;
		});
		if (gridEl) containerObserver.observe(gridEl);

		return () => {
			contentObserver?.disconnect();
			containerObserver?.disconnect();
			cleanupPending();
			resizeGeneration += 1;
			window.removeEventListener('resize', handleWindowResize);
			cancelAnimationFrame(resizeRafId);
		};
	});

	// Single entry point for keeping spans in sync with the DOM:
	//   - a changed `items` array (add/remove/refetch) re-observes and re-measures
	//   - an existing item whose content resizes is caught by the shared
	//     ResizeObserver registered in observeAll()
	// This covers every mutation that can affect a span, so there is deliberately
	// no MutationObserver here — a `subtree: true` one would fire on every node
	// inserted by the intro/outro transitions and multiply this work for no gain.
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
		{#if showContentModeToggle}
			<Icon
				name={contentModeIcon[viewState.masonryArticlesContentMode]}
				size={15}
				onClick={cycleContentMode}
				tooltipProps={{ content: contentModeTooltip[viewState.masonryArticlesContentMode] }}
			/>
		{/if}
		<Icon
			name={layoutIndex === 0 ? 'LayoutGrid' : 'List'}
			size={15}
			onClick={toggleRowMode}
			tooltipProps={{ content: layoutIndex === 0 ? 'Show grid' : 'Show list' }}
		/>
		{#if !fixedColumns}
			<Icon name="Minus" size={15} onClick={decreaseLayout} />
			<span class="column-count">{effectiveColumns}</span>
			<Icon name="Plus" size={15} onClick={increaseLayout} />
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
				in:itemTransition
				out:itemTransition
			>
				<div class="content">
					{@render children(item, i, layoutIndex, currentLayout.key)}
				</div>
			</div>
		{/each}
	</div>
</div>

<style>
	.column-count {
		font-size: 0.75rem;
		min-width: 1rem;
		text-align: center;
	}

	.masonry-container {
		width: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.layout-header {
		display: flex;
		justify-content: flex-end;
		gap: 2rem;
		padding: 0.2rem 2rem;
		width: 100%;
	}

	.masonry-grid {
		display: grid;
		width: 100%;
		grid-auto-flow: dense;
		padding-top: 1.3rem;
	}

	.grid-item {
		display: flex;
		align-items: center;
		min-width: 150px;
		overflow: hidden;
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
