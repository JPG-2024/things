import { invoke } from '@tauri-apps/api/core';
import { viewState } from '@/stores/viewStore.svelte';
import { ttsState } from '@/stores/ttsStore.svelte';
import { articleManager } from '@/runners/articleManager.svelte';
import { handlePasteUrl } from '@/lib/utils/pasteUrl';
import { isUrlList } from '@/lib/utils/url';
import { ensureAudioContext } from '@/lib/audioContextManager';

/** Must match `GLOBAL_CLIPBOARD_TRIGGER_EVENT` in the Rust backend. */
export const GLOBAL_CLIPBOARD_TRIGGER_EVENT = 'global-clipboard-trigger';

/**
 * Human-readable fallback trigger. Must stay in sync with
 * `CLIPBOARD_SHORTCUT_TRIGGER` in the Rust backend; the desktop may let the
 * user rebind it, in which case the shortcut store reports the real key.
 */
export const GLOBAL_CLIPBOARD_TRIGGER_LABEL = 'Ctrl + Shift + V';

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
 * Reads the clipboard once and hands it to the read-aloud branch or to
 * {@link handleClipboardContent}.
 *
 * Called by the global shortcut and by the dashboard title click. With
 * "read copied text" on, copied prose is spoken instead of captured; URL lists
 * keep going through the capture pipeline so links are never read aloud.
 */
export async function readClipboardAndHandle(): Promise<void> {
	try {
		const clipboardText = await invoke<string>('read_clipboard_text');
		console.debug('[clipboard-shortcut] event received', {
			length: clipboardText?.length ?? 0
		});

		const trimmed = (clipboardText ?? '').trim();
		if (!trimmed) return;

		if (viewState.clipboardTtsEnabled && !isUrlList(trimmed)) {
			void ensureAudioContext();
			await ttsState.generateFromClipboard(trimmed);
			return;
		}

		await handleClipboardContent(trimmed);
	} catch (error) {
		console.warn('[clipboard-shortcut] error', error);
	}
}
