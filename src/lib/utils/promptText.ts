/**
 * Pure text helpers of the prompt store: resolving a stored value against its
 * default and merging a persisted section back onto a known shape.
 *
 * Kept free of runes and of the Tauri store so it stays testable on its own.
 */
import {
	RECURSIVE_SUMMARY_FINAL_USER_MESSAGE,
	RECURSIVE_SUMMARY_SYSTEM_MESSAGE,
	RECURSIVE_SUMMARY_USER_MESSAGE
} from '@/lib/utils/inference/prompts';

/**
 * Editable prompts of the runner. The union is the API of the store: adding a
 * key means adding a default here and a field to the modal.
 */
export type PromptKey = 'windowSystem' | 'windowUser' | 'finalUser';

/** Snapshot of the built-in prompts: what an unset (or cleared) key runs with. */
export const PROMPT_DEFAULTS: Record<PromptKey, string> = {
	windowSystem: RECURSIVE_SUMMARY_SYSTEM_MESSAGE,
	windowUser: RECURSIVE_SUMMARY_USER_MESSAGE,
	finalUser: RECURSIVE_SUMMARY_FINAL_USER_MESSAGE
};

export const PROMPT_KEYS = Object.keys(PROMPT_DEFAULTS) as PromptKey[];

/**
 * The text a run sends for `key`.
 *
 * An empty (or whitespace-only) value means "not configured": the built-in
 * default is used instead, so a cleared field never sends a blank prompt.
 */
export function resolvePrompt(key: PromptKey, value: string | undefined): string {
	const trimmed = typeof value === 'string' ? value.trim() : '';
	return trimmed || PROMPT_DEFAULTS[key];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Merges a persisted (untrusted) section over the default shape.
 *
 * Unknown keys are dropped and non-string values are ignored, so a stale or
 * hand-edited `prompts.json` can never put a number into a prompt.
 */
export function mergePrompts(patch: unknown): Record<PromptKey, string> {
	const out: Record<PromptKey, string> = { ...PROMPT_DEFAULTS };
	if (!isPlainObject(patch)) return out;

	for (const key of PROMPT_KEYS) {
		const raw = patch[key];
		if (typeof raw === 'string') out[key] = raw;
	}
	return out;
}

/** Snapshot of the current values in the shape the store persists. */
export function serializePrompts(values: Record<PromptKey, string>): Record<PromptKey, string> {
	const out = {} as Record<PromptKey, string>;
	for (const key of PROMPT_KEYS) {
		out[key] = values[key] ?? PROMPT_DEFAULTS[key];
	}
	return out;
}
