<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		width?: string;
		gap?: number;
		fadeEdges?: boolean;
		scrollSpeed?: number;
		children: Snippet;
	}

	let { width = '100%', gap = 12, fadeEdges = true, scrollSpeed = 1, children }: Props = $props();

	function handleWheel(e: WheelEvent) {
		if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
		const el = e.currentTarget as HTMLDivElement;
		const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
		el.scrollLeft += delta * scrollSpeed;
		e.preventDefault();
	}

	export function scrollChildIntoView(child: HTMLElement): void {
		child.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
	}
</script>

<div
	class="wheel-stage"
	class:fade-edges={fadeEdges}
	style="width: {width}; --stage-gap: {gap}px;"
	onwheel={handleWheel}
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
