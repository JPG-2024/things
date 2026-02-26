// Tauri doesn't have a Node.js server to do proper SSR
// so we use adapter-static with a fallback to index.html to put the site in SPA mode
// See: https://svelte.dev/docs/kit/single-page-apps
// See: https://v2.tauri.app/start/frontend/sveltekit/ for more info
/* import adapter from "@sveltejs/adapter-static"; */
import adapter from "@sveltejs/adapter-static"
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte"
import path from "path"

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess({
		postcss: true,
		script: true,
	}),
	kit: {
		prerender: {
			crawl: false,
		},
		adapter: adapter({
			fallback: "index.html",
		}),
		alias: {
			// Common: @ points to src/
			"@": path.resolve("./src"),

			// Optional sub-aliases (like many projects do)
			/*       '@components': path.resolve('./src/components'),
            '@lib': path.resolve('./src/lib'),
            '@utils': path.resolve('./src/utils'),
            '@assets': path.resolve('./src/assets'),
            '@stores': path.resolve('./src/stores') */
		},
	},
}

export default config
