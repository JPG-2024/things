import { WHEEL_NAVIGATION_MIN_DELTA_PX, WHEEL_NAVIGATION_QUIET_MS } from '@/constants';
import { navigateBack, navigateForward } from '@/stores/navigationHistory.svelte';
import { viewState } from '@/stores/viewStore.svelte';
import { ttsState } from '@/stores/ttsStore.svelte';
import { resolveWheelDelta } from './wheelDelta';

const TEXT_ENTRY_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function isEditableTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	return target.isContentEditable || TEXT_ENTRY_TAGS.has(target.tagName);
}

/**
 * Shift+wheel walks the in-app history: down goes back, up goes forward.
 *
 * Installed once from `+layout.svelte` so it applies to every route. The
 * listener sits in the capture phase on purpose: `Tabs` and `WheelStage` own
 * `wheel` in the bubble phase (Tabs switches tabs, WheelStage scrolls its
 * strip) and would otherwise consume the gesture first.
 *
 * A gesture moves one step: deltas accumulate until they pass the threshold
 * and the gesture only re-arms after `WHEEL_NAVIGATION_QUIET_MS` without
 * wheel events, so trackpad inertia cannot race through the whole stack.
 */
export function installWheelHistoryNavigation(): () => void {
	let accumulated = 0;
	/** False after a step until the wheel goes quiet, so a flick moves once. */
	let armed = true;
	let quietTimer: ReturnType<typeof setTimeout> | null = null;

	function scheduleRearm(): void {
		if (quietTimer !== null) clearTimeout(quietTimer);
		quietTimer = setTimeout(() => {
			quietTimer = null;
			armed = true;
			accumulated = 0;
		}, WHEEL_NAVIGATION_QUIET_MS);
	}

	function handleWheel(event: WheelEvent): void {
		if (!event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
		if (viewState.overlayOpen || ttsState.isPlaying || ttsState.isPaused) return;
		if (isEditableTarget(event.target)) return;

		const delta = resolveWheelDelta(event.deltaX, event.deltaY, event.deltaMode);
		if (delta === 0) return;

		// Own the gesture even while the step is already spent, so shift+wheel
		// never falls through to horizontal scrolling behind it.
		event.preventDefault();
		event.stopPropagation();

		accumulated += delta;
		// Also clears sub-threshold leftovers and extends the gate while the
		// wheel keeps moving.
		scheduleRearm();

		if (!armed) return;
		if (Math.abs(accumulated) < WHEEL_NAVIGATION_MIN_DELTA_PX) return;

		const direction = accumulated;
		accumulated = 0;
		armed = false;

		if (direction > 0) {
			void navigateBack();
		} else {
			void navigateForward();
		}
	}

	window.addEventListener('wheel', handleWheel, { capture: true, passive: false });

	return () => {
		window.removeEventListener('wheel', handleWheel, { capture: true });
		if (quietTimer !== null) clearTimeout(quietTimer);
	};
}
