import { fade, fly, scale } from 'svelte/transition';
import type { TransitionConfig } from 'svelte/transition';
import { cubicOut } from 'svelte/easing';

export type AnimationPreset = 'slide' | 'fade' | 'scale' | 'none';

export interface ItemTransitionOptions {
	duration?: number;
}

/** Shape of the transition function shared by every tab item renderer. */
export type ItemTransition = (node: Element, options?: ItemTransitionOptions) => TransitionConfig;

export interface ItemTransitionConfig {
	preset: AnimationPreset;
	/** 1 = enter from the right, -1 = enter from the left */
	dir?: 1 | -1;
	/** Fallback duration when the call site passes none. */
	duration?: number;
}

/**
 * Single source of truth for the named motions. Adding a preset here is enough
 * to make it available to every grid via `presetTransition`.
 */
export const TRANSITION_PRESETS = {
	slideLeft: { preset: 'slide', dir: -1 },
	slideRight: { preset: 'slide', dir: 1 },
	fade: { preset: 'fade' },
	scale: { preset: 'scale' },
	none: { preset: 'none' },
	/** Grid default when a caller passes no `itemTransition`. */
	gridEnterLeave: { preset: 'scale', duration: 200 }
} satisfies Record<string, ItemTransitionConfig>;

export type TransitionPresetName = keyof typeof TRANSITION_PRESETS;

const reducedMotionQuery =
	typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

export function prefersReducedMotion(): boolean {
	return reducedMotionQuery?.matches ?? false;
}

/**
 * Builds the concrete Svelte transition for a preset.
 *
 * IMPORTANT: callers that read reactive animation state must invoke this from
 * inside `untrack()`. An `in:` transition runs inside the element's creation
 * effect, so a tracked read there would re-run that effect (and re-create list
 * items) on every later tab switch.
 */
export function buildTransition(
	node: Element,
	options: ItemTransitionOptions,
	config: ItemTransitionConfig
): TransitionConfig {
	if (config.preset === 'none' || prefersReducedMotion()) return {};

	const duration = options.duration ?? config.duration ?? 240;

	switch (config.preset) {
		case 'fade':
			return fade(node, { duration, easing: cubicOut });
		case 'scale':
			return scale(node, { duration, start: 0.96, opacity: 0, easing: cubicOut });
		case 'slide':
			return fly(node, { x: 16 * (config.dir ?? 1), opacity: 0, duration, easing: cubicOut });
		default:
			return {};
	}
}

/**
 * Binds a named preset to a stable `ItemTransition`. `options` act as factory
 * defaults; per-call options (e.g. from `in:itemTransition={{ duration }}`)
 * override them.
 *
 * Create the result once (module or component scope), never inline in a
 * template: a new function identity on every render is what the tab animation
 * store's stable `transitionFor` avoids.
 */
export function presetTransition(
	preset: TransitionPresetName | ItemTransitionConfig,
	options: ItemTransitionOptions = {}
): ItemTransition {
	const config = typeof preset === 'string' ? TRANSITION_PRESETS[preset] : preset;
	return (node, opts) => buildTransition(node, { ...options, ...opts }, config);
}

/** Enter from / exit to the right: the dashboard's "next tab" slide. */
export const slideRight = presetTransition('slideRight');

/**
 * Default enter/leave animation for grids that receive no explicit
 * transition: a subtle fade + scale (no-op under reduced motion). It lives
 * here, not inside the grid component, so callers that wrap the transition
 * (e.g. `ArticleList`'s grouping-swap suppression) can fall back to the exact
 * same animation when the caller has none of its own.
 */
export const enterLeave = presetTransition('gridEnterLeave');
