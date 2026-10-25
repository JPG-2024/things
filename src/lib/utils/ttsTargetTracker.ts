import { ttsState } from '@/stores/ttsStore.svelte';
import { resolveTargetIdAt } from './ttsTargets';

/**
 * Mirrors the registered block under the pointer into `ttsState.hoveredTargetId`.
 *
 * Resolution goes through `elementFromPoint` instead of per-component enter/leave
 * handlers so nested renderers resolve to the innermost block without enter/leave
 * ordering bugs, and so a still pointer keeps tracking content that scrolls
 * underneath it. Installed once from `+layout.svelte`.
 */
export function installTargetPointerTracking(): () => void {
	let lastX = 0;
	let lastY = 0;
	let pointerInside = false;
	let frame: number | null = null;

	function resolve(): void {
		frame = null;
		ttsState.setHoveredTarget(pointerInside ? resolveTargetIdAt(lastX, lastY) : null);
	}

	function schedule(): void {
		if (frame !== null) return;
		frame = requestAnimationFrame(resolve);
	}

	function handlePointerMove(event: PointerEvent): void {
		pointerInside = true;
		lastX = event.clientX;
		lastY = event.clientY;
		schedule();
	}

	/** Re-resolve on scroll: the pointer can sit still over moving content. */
	function handleScroll(): void {
		if (pointerInside) schedule();
	}

	function handlePointerOut(event: PointerEvent): void {
		// A null relatedTarget means the pointer left the window; moving between
		// elements has a real relatedTarget and is already handled by pointermove.
		if (event.relatedTarget !== null) return;
		pointerInside = false;
		ttsState.setHoveredTarget(null);
	}

	function handleBlur(): void {
		pointerInside = false;
		ttsState.setHoveredTarget(null);
	}

	document.addEventListener('pointermove', handlePointerMove, { passive: true });
	// Capture: scrolling happens inside nested containers and does not bubble.
	document.addEventListener('scroll', handleScroll, { passive: true, capture: true });
	document.addEventListener('pointerout', handlePointerOut, { passive: true });
	window.addEventListener('blur', handleBlur);

	return () => {
		if (frame !== null) cancelAnimationFrame(frame);
		document.removeEventListener('pointermove', handlePointerMove);
		document.removeEventListener('scroll', handleScroll, { capture: true });
		document.removeEventListener('pointerout', handlePointerOut);
		window.removeEventListener('blur', handleBlur);
		ttsState.setHoveredTarget(null);
	};
}
