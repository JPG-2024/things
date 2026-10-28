import { isTauri } from '@tauri-apps/api/core';
import { LazyStore } from '@tauri-apps/plugin-store';
import {
	mergePrompts,
	PROMPT_DEFAULTS,
	resolvePrompt,
	serializePrompts,
	type PromptKey
} from '@/lib/utils/promptText';

export type { PromptKey };

const STORE_FILE = 'prompts.json';

/** How long a keystroke waits before it hits disk. */
const SAVE_DEBOUNCE_MS = 400;

let store: LazyStore | null = null;
let loaded = false;
let persistenceStarted = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * The editable prompts of the runner.
 *
 * Values are the raw editor state: `''` is a legitimate value meaning "not
 * configured", which {@link promptState.resolve} turns back into the default.
 */
class PromptState {
	windowSystem = $state(PROMPT_DEFAULTS.windowSystem);
	windowUser = $state(PROMPT_DEFAULTS.windowUser);
	finalUser = $state(PROMPT_DEFAULTS.finalUser);

	/** Reads the current value of a key. */
	get(key: PromptKey): string {
		return this[key];
	}

	/** Writes the current value of a key. */
	set(key: PromptKey, value: string): void {
		this[key] = value;
	}

	/**
	 * The text a run must send for `key`: the stored value, or the built-in
	 * default when it is empty.
	 */
	resolve(key: PromptKey): string {
		return resolvePrompt(key, this.get(key));
	}

	/** Whether `key` is running on a user override rather than the default. */
	isCustomized(key: PromptKey): boolean {
		return resolvePrompt(key, this.get(key)) !== PROMPT_DEFAULTS[key];
	}

	snapshot(): Record<PromptKey, string> {
		return serializePrompts({
			windowSystem: this.windowSystem,
			windowUser: this.windowUser,
			finalUser: this.finalUser
		});
	}
}

export const promptState = new PromptState();

function detectTauri(): boolean {
	try {
		return isTauri();
	} catch {
		return false;
	}
}

/**
 * Loads the persisted prompts and applies them. No-op outside Tauri (e.g. a
 * plain browser dev server) and on a second call.
 */
export async function loadPrompts(): Promise<void> {
	if (loaded || !detectTauri()) return;
	store = new LazyStore(STORE_FILE, { autoSave: true });
	loaded = true;

	try {
		const raw = await store.get<unknown>('prompts');
		const merged = mergePrompts(raw);
		promptState.windowSystem = merged.windowSystem;
		promptState.windowUser = merged.windowUser;
		promptState.finalUser = merged.finalUser;
	} catch (err) {
		console.warn('[prompts] failed to load prompts', err);
	}
}

/**
 * Registers the write effect. Must run after {@link loadPrompts} so the first
 * pass does not persist while the store is still hydrating.
 *
 * Writes are debounced: the modal edits on every keystroke.
 */
export function startPromptsPersistence(): void {
	if (!store || persistenceStarted) return;
	persistenceStarted = true;

	const activeStore = store;
	$effect.root(() => {
		$effect(() => {
			const value = promptState.snapshot();
			if (saveTimer !== null) clearTimeout(saveTimer);
			saveTimer = setTimeout(() => {
				saveTimer = null;
				void activeStore.set('prompts', value).catch((err: unknown) => {
					console.warn('[prompts] failed to save prompts', err);
				});
			}, SAVE_DEBOUNCE_MS);
		});
	});
}

export { PROMPT_DEFAULTS };
