import { goto } from '$app/navigation';
import { createHotkey } from '@tanstack/svelte-hotkeys';
import { viewState } from '@/stores/viewStore.svelte';
import { ttsState } from '@/stores/ttsStore.svelte';

/**
 * Remembers the routes left behind and the routes a back navigation skipped
 * over, so in-app back/forward retrace the trail (dashboard → profile →
 * article, back from the article lands on the profile, forward returns to the
 * article) instead of always jumping to the dashboard.
 *
 * The root layout feeds the stacks via `afterNavigate`; every "back" intent in
 * the app routes through `navigateBack`.
 */
const backStack: string[] = [];
const forwardStack: string[] = [];

/**
 * The step one of our own navigation helpers asked for. It lets
 * `recordNavigation` tell a back/forward jump apart from a fresh navigation
 * (the stacks alone cannot express direction).
 */
let pending: { direction: 'back' | 'forward'; target: string } | null = null;

function pathOf(url: URL): string {
	return `${url.pathname}${url.search}`;
}

/**
 * Called from the layout's `afterNavigate` on every route change. A navigation
 * we started ourselves consumes its intent and moves the departed route to the
 * opposite stack; anything else grows the back stack and invalidates whatever
 * was ahead.
 */
export function recordNavigation(from: URL | null, to: URL | null): void {
	if (!to) return;
	const target = pathOf(to);
	if (from && pathOf(from) === target) return;
	const fromPath = from ? pathOf(from) : null;

	if (pending && pending.target === target) {
		if (pending.direction === 'back') {
			backStack.pop();
			if (fromPath) forwardStack.push(fromPath);
		} else {
			forwardStack.pop();
			if (fromPath) backStack.push(fromPath);
		}
		pending = null;
		return;
	}

	// A navigation we did not request: any forward trail is now stale.
	pending = null;
	if (fromPath) backStack.push(fromPath);
	forwardStack.length = 0;
}

/**
 * Jumps to the top of `backStack` (or `fallback` when none is recorded).
 * `afterNavigate` runs before `goto` resolves, so the intent is still pending
 * when the layout records this navigation; clearing it in `finally` only
 * matters when the jump did not produce a navigation at all.
 */
export async function navigateBack(fallback = '/'): Promise<void> {
	if (pending) return;
	const previous = backStack[backStack.length - 1] ?? fallback;
	pending = { direction: 'back', target: previous };
	try {
		await goto(previous);
	} finally {
		pending = null;
	}
}

/** Jumps to the route the last back navigation skipped over, if any. */
export async function navigateForward(): Promise<void> {
	if (pending) return;
	const next = forwardStack[forwardStack.length - 1];
	if (!next) return;
	pending = { direction: 'forward', target: next };
	try {
		await goto(next);
	} finally {
		pending = null;
	}
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
