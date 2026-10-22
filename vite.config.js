import { sveltekit } from '@sveltejs/kit/vite';
import { homedir } from 'node:os';
import { searchForWorkspaceRoot } from 'vite';
import { defineConfig } from 'vite';

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// The Tauri app data dir, where the workspaces (and their media) live. In dev
// the frontend loads media through Vite's `/@fs` route (WebKitGTK 2.54 blocks
// `asset://` on http origins, see tauri-apps/tauri#16201), so this dir must be
// allowed for out-of-root file serving.
// @ts-expect-error process is a nodejs global
const appDataDir = process.env.APPDATA
	? // @ts-expect-error process is a nodejs global
		`${process.env.APPDATA}/com.juangargiulo.things`
	: process.platform === 'darwin'
		? `${homedir()}/Library/Application Support/com.juangargiulo.things`
		: `${homedir()}/.local/share/com.juangargiulo.things`;

// https://vite.dev/config/
export default defineConfig(async () => ({
	plugins: [sveltekit()],
	css: {
		postcss: {
			// Excluye los archivos .svelte del procesamiento con PostCSS
			exclude: ['*.svelte']
		}
	},
	// Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
	//
	// 1. prevent Vite from obscuring rust errors
	clearScreen: false,
	// 2. tauri expects a fixed port, fail if that port is not available
	server: {
		port: 1420,
		strictPort: true,
		host: host || false,
		hmr: host
			? {
					protocol: 'ws',
					host,
					port: 1421
				}
			: undefined,
		fs: {
			allow: [searchForWorkspaceRoot(process.cwd()), appDataDir]
		},
		watch: {
			// 3. tell Vite to ignore watching `src-tauri`
			ignored: ['**/src-tauri/**']
		}
	}
}));
