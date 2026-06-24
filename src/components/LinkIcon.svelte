<script lang="ts">
	import { openUrl } from '@tauri-apps/plugin-opener';
	import Icon from './Icon.svelte';

	let { url }: { url: string } = $props();

	async function handleClick(event: MouseEvent) {
		event.preventDefault();
		if (event.metaKey || event.ctrlKey || event.button === 2) {
			try {
				await navigator.clipboard.writeText(url);
			} catch (err) {
				console.error('Failed to copy!', err);
			}
			return;
		}
		try {
			await openUrl(url);
		} catch (err) {
			console.error('Failed to open URL!', err);
		}
	}

	function handleContextMenu(event: MouseEvent) {
		event.preventDefault();
	}
</script>

<button
	type="button"
	onclick={handleClick}
	oncontextmenu={handleContextMenu}
	class="link"
	title="Open link in browser (Cmd/Ctrl-click to copy)"
>
	<Icon name="Link" />
</button>

<style>
	.link {
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
	}

	.link:hover {
		text-decoration: underline;
	}
</style>
