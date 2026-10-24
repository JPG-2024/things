/**
 * Raw content access.
 *
 * The body of an article never lives in the store: it is written once to
 * `raw_content/<sha256(url)>.txt` and read back on demand. This keeps the
 * webview memory flat no matter how big the articles are.
 */
import { invoke } from '@tauri-apps/api/core';

/**
 * Reads the raw body of an article. Returns `null` when the article has no
 * stored body (a YouTube video captured in `metadata` mode, for instance).
 */
export async function readRawContent(url: string): Promise<string | null> {
	if (!url) return null;

	try {
		const text = await invoke<string | null>('read_raw_content_by_url', { url });
		return typeof text === 'string' ? text : null;
	} catch (error) {
		console.warn(`[rawContent] unable to read raw content for "${url}"`, error);
		return null;
	}
}

/**
 * Reads one window of the raw body, using the offsets stored with the
 * analysis. Returns an empty string when the body is gone or the offsets
 * fall outside it.
 */
export async function readRawWindow(url: string, start: number, end: number): Promise<string> {
	const content = await readRawContent(url);
	if (!content) return '';

	return content.slice(Math.max(0, start), Math.max(0, end));
}

/** Writes the raw body of an article. Returns the storage key. */
export async function writeRawContent(url: string, text: string): Promise<string> {
	return invoke<string>('write_raw_content', { url, text });
}
