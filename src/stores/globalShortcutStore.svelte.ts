import { invoke } from '@tauri-apps/api/core';
import { viewState } from '@/stores/viewStore.svelte';

/**
 * State of the OS-global clipboard shortcut.
 *
 * The desktop owns the binding: this store only mirrors it so the banner and
 * the settings panel can show whether the shortcut is active and which key the
 * user actually assigned (the portal lets them rebind it).
 */
class GlobalShortcutStore {
	/** Whether this build/platform can register global shortcuts at all. */
	supported = $state(false);
	/** True once the desktop reports a non-empty binding. */
	bound = $state(false);
	/** Real trigger text reported by the desktop, e.g. `Ctrl+Shift+V`. */
	trigger = $state<string | null>(null);
	/** Last backend error, surfaced in the UI instead of only the dev terminal. */
	error = $state<string | null>(null);
	busy = $state(false);

	private applyTrigger(trigger: string | null): void {
		this.bound = trigger !== null;
		this.trigger = trigger;
		this.error = null;
		if (trigger !== null) {
			viewState.globalShortcutConsented = true;
		}
	}

	/**
	 * Reuses an existing binding without ever opening a dialog. Returns whether
	 * the shortcut is bound afterwards.
	 */
	async probe(): Promise<boolean> {
		this.busy = true;
		try {
			this.supported = await invoke<boolean>('global_shortcut_supported');
			if (!this.supported) return false;
			this.applyTrigger(await invoke<string | null>('probe_global_shortcut'));
			return this.bound;
		} catch (error) {
			this.error = String(error);
			return false;
		} finally {
			this.busy = false;
		}
	}

	/**
	 * Binds the shortcut. The first call may open the desktop confirmation
	 * dialog. Returns whether the shortcut is bound afterwards.
	 */
	async register(): Promise<boolean> {
		this.busy = true;
		this.error = null;
		try {
			this.supported = await invoke<boolean>('global_shortcut_supported');
			if (!this.supported) return false;
			this.applyTrigger(await invoke<string | null>('register_global_shortcut'));
			return this.bound;
		} catch (error) {
			this.error = String(error);
			return false;
		} finally {
			this.busy = false;
		}
	}
}

export const globalShortcutStore = new GlobalShortcutStore();
