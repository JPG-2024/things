<script module lang="ts">
	export type LayoutKey = 'row' | 'grid-3' | 'grid-2';

	export interface LayoutConfig {
		width: number;
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

	interface Props {
		items: T[];
		keyOf?: (item: T) => string;
		children: Snippet<[T, number, number, LayoutKey]>;
	}

	let {
		items,
		keyOf = (item: T) => (item as { url?: string | null }).url ?? '',
		children
	}: Props = $props();

	let gridEl: HTMLDivElement;
	let wrapperEls = $state<HTMLDivElement[]>([]);
	let resizeObservers: ResizeObserver[] = [];
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

	let layoutIndex = $derived(viewState.masonryLayoutIndex);

	const layouts: LayoutConfig[] = [
		{ width: 1000, columns: 1, padding: '0.6rem', rowHeight: 50, key: 'row' },
		{ width: 400, columns: 3, padding: '3rem', key: 'grid-3' },
		{ width: 500, columns: 2, padding: '2rem', key: 'grid-2' }
	];

	let currentLayout = $derived(layouts[layoutIndex]);

	function decreaseLayout() {
		if (viewState.masonryLayoutIndex > 0) viewState.masonryLayoutIndex--;
	}

	function increaseLayout() {
		if (viewState.masonryLayoutIndex < layouts.length - 1) viewState.masonryLayoutIndex++;
	}

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

		if (currentLayout.rowHeight) {
			for (const wrapper of wrapperEls) {
				if (wrapper?.isConnected) setRowSpan(wrapper, 1);
			}
			return;
		}

		const { rowHeight, rowGap } = getRowMetrics();
		const measured: { wrapper: HTMLDivElement; contentHeight: number }[] = [];

		// read phase: all measurements before any writes to avoid layout thrashing
		for (const wrapper of wrapperEls) {
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

	function observeAll() {
		resizeObservers.forEach((obs) => obs.disconnect());
		resizeObservers = [];
		// spans from a previous items/layout state must not feed hysteresis
		lastSpans = new WeakMap();
		for (const wrapper of wrapperEls) {
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
		for (const wrapper of wrapperEls) {
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
			mutationObserver?.disconnect();
			cleanupPending();
			resizeGeneration += 1;
			window.removeEventListener('resize', scheduleResize);
			cancelAnimationFrame(rafId);
		};
	});

	$effect(() => {
		void items;
		void currentLayout;
		tick().then(() => {
			wrapperEls = wrapperEls.filter((el) => el?.isConnected);
			observeAll();
			scheduleResize();
		});
	});
</script>

<div class="masonry-container">
	<div class="layout-header">
		<Icon name="Minus" size={20} onClick={decreaseLayout} />
		<Icon name="Plus" size={20} onClick={increaseLayout} />
	</div>
	<div
		class="masonry-grid"
		bind:this={gridEl}
		style:grid-template-columns={`repeat(${currentLayout.columns}, 1fr)`}
		style:grid-auto-rows={currentLayout.rowHeight ? `${currentLayout.rowHeight}px` : '1px'}
		style:gap={currentLayout.padding}
		style:padding-bottom={currentLayout.padding}
		class:fixed-row-layout={currentLayout.rowHeight !== undefined}
	>
		{#each items as item, i (keyOf(item))}
			<div class="grid-item" bind:this={wrapperEls[i]}>
				<div class="content">
					{@render children(item, i, layoutIndex, currentLayout.key)}
				</div>
			</div>
		{/each}
	</div>
</div>

<style>
	.masonry-container {
		width: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.layout-header {
		display: flex;
		justify-content: flex-end;
		gap: 0.4rem;
		margin-bottom: 1rem;
		width: 100%;
		max-width: 1200px;
	}

	.masonry-grid {
		display: grid;
		width: 100%;
		max-width: 1200px;
	}

	.grid-item {
		display: flex;
		align-items: center;
		min-width: 150px;
		overflow: hidden;
		border-radius: var(--radius-sm);
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
