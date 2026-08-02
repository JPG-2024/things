<script lang="ts">
	import { openUrl } from '@tauri-apps/plugin-opener';
	import type { ComponentProps } from 'svelte';
	import Icon from './Icon.svelte';

	type Props = Omit<ComponentProps<typeof Icon>, 'name'> & { url: string };
	let { url, ...rest }: Props = $props();

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
	<Icon
		name="Link"
		color="var(--primary-color)"
		{...rest}
		tooltipProps={{ content: 'open link in browser' }}
	/>
</button>

<style>
	.link {
		display: flex;
		align-items: center;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
	}

	.link:hover {
		text-decoration: underline;
	}
</style>
