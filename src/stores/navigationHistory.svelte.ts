import { goto } from '$app/navigation';
import { page } from '$app/state';
import { createHotkey } from '@tanstack/svelte-hotkeys';
import { viewState } from '@/stores/viewStore.svelte';
import { ttsState } from '@/stores/ttsStore.svelte';
import type { ProfileArticleTabId } from '@/stores/tabAnimationStore.svelte';

/**
 * Remembers the routes left behind and the routes a back navigation skipped
 * over, so in-app back/forward retrace the trail (dashboard → profile →
 * article, back from the article lands on the profile, forward returns to the
 * article) instead of always jumping to the dashboard.
 *
 * The root layout feeds the stacks via `afterNavigate`; every "back" intent in
 * the app routes through `navigateBack`.
 */

/** A remembered route plus the dashboard tab that was active when we left it. */
interface HistoryEntry {
	path: string;
	tab: ProfileArticleTabId;
}

const backStack: HistoryEntry[] = [];
const forwardStack: HistoryEntry[] = [];

function isDashboardPath(path: string): boolean {
	return path.split('?')[0] === '/';
}

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
	// Snapshot the dashboard tab as it is right now: in `afterNavigate` it is
	// still the tab the departed route was showing.
	const departed: HistoryEntry | null = fromPath
		? { path: fromPath, tab: viewState.activeProfileArticleTab }
		: null;

	if (pending && pending.target === target) {
		if (pending.direction === 'back') {
			backStack.pop();
			if (departed) forwardStack.push(departed);
		} else {
			forwardStack.pop();
			if (departed) backStack.push(departed);
		}
		pending = null;
		return;
	}

	// A navigation we did not request: any forward trail is now stale.
	pending = null;
	if (departed) backStack.push(departed);
	forwardStack.length = 0;
}

/**
 * Jumps to the top of `backStack` (or `fallback` when none is recorded).
 * `afterNavigate` runs before `goto` resolves, so the intent is still pending
 * when the layout records this navigation; clearing it in `finally` only
 * matters when the jump did not produce a navigation at all.
 *
 * Landing on the dashboard restores the tab that was showing when we left it.
 * A back step that keeps us on the dashboard (stack empty, or the top entry is
 * the route we already are on) instead resets to `articles` — one tick further
 * back always means "home". The tab is written before `goto` so `+page.svelte`
 * never renders a frame with the stale tab; `ProfileArticleTabs`' `$effect`
 * picks the change up for the switch animation.
 */
export async function navigateBack(fallback = '/'): Promise<void> {
	if (pending) return;
	const entry = backStack[backStack.length - 1] ?? null;
	const previous = entry?.path ?? fallback;

	if (isDashboardPath(previous)) {
		const stayPut = pathOf(page.url) === previous;
		viewState.activeProfileArticleTab = entry && !stayPut ? entry.tab : 'articles';
	}

	pending = { direction: 'back', target: previous };
	try {
		await goto(previous);
	} finally {
		pending = null;
	}
}

/**
 * Jumps to the route the last back navigation skipped over, if any. Restores
 * the remembered dashboard tab when the target is the dashboard, without the
 * reset-to-articles rule: that belongs to back only.
 */
export async function navigateForward(): Promise<void> {
	if (pending) return;
	const entry = forwardStack[forwardStack.length - 1];
	if (!entry) return;

	if (isDashboardPath(entry.path)) {
		viewState.activeProfileArticleTab = entry.tab;
	}

	pending = { direction: 'forward', target: entry.path };
	try {
		await goto(entry.path);
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
