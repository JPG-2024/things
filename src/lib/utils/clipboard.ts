import { invoke } from '@tauri-apps/api/core';
import { viewState } from '@/stores/viewStore.svelte';
import { handlePasteUrl } from '@/lib/utils/pasteUrl';

/** Must match `GLOBAL_CLIPBOARD_TRIGGER_EVENT` in the Rust backend. */
export const GLOBAL_CLIPBOARD_TRIGGER_EVENT = 'global-clipboard-trigger';

/**
 * Routes clipboard content through the URL/raw pipeline.
 *
 * If something is already being processed, the content is queued and drained by
 * `processQueue` once the current run finishes (same queue the URL pipeline
 * uses). Shared by the global shortcut and the title click.
 */
export async function handleClipboardContent(text: string): Promise<void> {
	const trimmed = text.trim();
	if (!trimmed) return;

	if (viewState.processingUrl || viewState.loading) {
		if (viewState.forceLanguageEnabled || viewState.urlQueue.length < viewState.maxUrlQueueSize) {
			viewState.urlQueue.push(trimmed);
		}
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
