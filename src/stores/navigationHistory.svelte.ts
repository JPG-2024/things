import { goto } from '$app/navigation';
import { createHotkey } from '@tanstack/svelte-hotkeys';
import { viewState } from '@/stores/viewStore.svelte';
import { ttsState } from '@/stores/ttsStore.svelte';

/**
 * Remembers the routes left behind so back navigations return to the previous
 * route (dashboard → profile → article, back from the article lands on the
 * profile) instead of always jumping to the dashboard.
 *
 * The root layout feeds the stack via `afterNavigate`; every "back" intent in
 * the app routes through `navigateBack`.
 */
const stack: string[] = [];

function pathOf(url: URL): string {
	return `${url.pathname}${url.search}`;
}

/**
 * Called from the layout's `afterNavigate` on every route change. Pushes the
 * route we left onto the stack, except when the destination is already the top
 * of the stack — that means this navigation was itself a `navigateBack` call,
 * so the entry is consumed instead of pushed.
 */
export function recordNavigation(from: URL | null, to: URL | null): void {
	if (!to) return;
	const target = pathOf(to);
	if (from && pathOf(from) === target) return;
	if (stack.length > 0 && stack[stack.length - 1] === target) {
		stack.pop();
		return;
	}
	if (from) stack.push(pathOf(from));
}

/** Navigates to the previous route, falling back to `fallback` when none is recorded. */
export async function navigateBack(fallback = '/'): Promise<void> {
	const previous = stack[stack.length - 1];
	await goto(previous ?? fallback);
}

/**
 * Binds plain `ArrowLeft` to `navigateBack`. For non-dashboard components with
 * a back affordance (PostView, profile/category pages); the dashboard keeps
 * the arrows for tab switching. Guarded so the arrows stay owned by overlays
 * and TTS playback (seek) — the hotkey manager fires every matching handler.
 */
export function createBackHotkey(): void {
	createHotkey(
		'ArrowLeft',
		() => {
			void navigateBack();
		},
		() => ({
			enabled: !viewState.overlayOpen && !ttsState.isPlaying && !ttsState.isPaused,
			ignoreInputs: true,
			stopPropagation: true,
			preventDefault: true
		})
	);
}
