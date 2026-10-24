import { invoke } from '@tauri-apps/api/core';
import { viewState } from '@/stores/viewStore.svelte';
import { articleManager } from '@/runners/articleManager.svelte';
import { handlePasteUrl } from '@/lib/utils/pasteUrl';

/** Must match `GLOBAL_CLIPBOARD_TRIGGER_EVENT` in the Rust backend. */
export const GLOBAL_CLIPBOARD_TRIGGER_EVENT = 'global-clipboard-trigger';

/**
 * Routes clipboard content through the URL/raw pipeline.
 *
 * `handlePasteUrl` is the only entry point: it owns the "capture in the
 * background" branch, so the clipboard path inherits it for free.
 */
export async function handleClipboardContent(text: string): Promise<void> {
	const trimmed = text.trim();
	if (!trimmed) return;

	if (viewState.processingUrl || viewState.loading) {
		// Something is running: the url is queued by the manager instead.
		articleManager.enqueue(trimmed);
		return;
	}

	await handlePasteUrl(trimmed);
}

/**
 * Reads the clipboard once and hands it to {@link handleClipboardContent}.
 * Called on every global-shortcut activation.
 */
export async function readClipboardAndHandle(): Promise<void> {
	try {
		const clipboardText = await invoke<string>('read_clipboard_text');
		await handleClipboardContent(clipboardText ?? '');
	} catch (error) {
		console.warn('[clipboard-shortcut] error', error);
	}
}
