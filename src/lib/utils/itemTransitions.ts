import { fade, fly, scale } from 'svelte/transition';
import type { TransitionConfig } from 'svelte/transition';
import { cubicOut } from 'svelte/easing';

export type AnimationPreset = 'slide' | 'fade' | 'scale' | 'none';

export interface ItemTransitionOptions {
	duration?: number;
}

/** Shape of the transition function shared by every tab item renderer. */
export type ItemTransition = (
	node: Element,
	options?: ItemTransitionOptions
) => TransitionConfig;

export interface ItemTransitionConfig {
	preset: AnimationPreset;
	/** 1 = enter from the right, -1 = enter from the left */
	dir: 1 | -1;
}

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

	const duration = options.duration ?? 240;

	switch (config.preset) {
		case 'fade':
			return fade(node, { duration, easing: cubicOut });
		case 'scale':
			return scale(node, { duration, start: 0.96, opacity: 0, easing: cubicOut });
		case 'slide':
			return fly(node, { x: 16 * config.dir, opacity: 0, duration, easing: cubicOut });
		default:
			return {};
	}
}
