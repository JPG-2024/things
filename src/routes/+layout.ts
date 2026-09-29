// Tauri doesn't have a Node.js server to do proper SSR
// so we use adapter-static with a fallback to index.html to put the site in SPA mode
// See: https://svelte.dev/docs/kit/single-page-apps
// See: https://v2.tauri.app/start/frontend/sveltekit/ for more info
import { loadSettings } from '@/stores/settingsStore.svelte';

export const ssr = false;
export const prerender = true;

export async function load(): Promise<void> {
	// Runs on the client before the layout renders, so persisted settings are
	// applied before any child component mounts and resolves its own state.
	await loadSettings();
}
