import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { isTauri } from '@tauri-apps/api/core';

/**
 * Native fetch when running inside Tauri (bypasses the webview's CORS
 * preflight, which remote inference endpoints don't answer), plain fetch
 * otherwise so `bun run dev` in a browser keeps working.
 */
export const httpFetch: typeof fetch = isTauri()
	? (tauriFetch as unknown as typeof fetch)
	: globalThis.fetch.bind(globalThis);
