<script lang="ts">
	import type { Snippet } from 'svelte';
	import { goto } from '$app/navigation';
	/* import { createHotkey } from '@tanstack/svelte-hotkeys'; */
	import { viewState } from '@/stores/viewStore.svelte';
	import { downloadFavicon } from '@/lib/urlRouter/faviconDownloader';
	import Icon from '@/components/Icon.svelte';

	interface Props {
		children?: Snippet;
	}

	let { children }: Props = $props();

	let faviconSrc = $state<string | null>(null);

	$effect(() => {
		if (!viewState.domainUrl) {
			faviconSrc = null;
			return;
		}

		const googleUrl = `https://www.google.com/s2/favicons?sz=64&domain=${viewState.domainUrl}`;
		faviconSrc = googleUrl;

		(async () => {
			const result = await downloadFavicon(viewState.domainUrl!);
			if (result) {
				faviconSrc = result.src;
			}
		})();
	});

	function handleBackNavigation() {
		goto(`/`);
	}

	/* 	createHotkey('Escape', handleBackNavigation, {
		stopPropagation: true,
		preventDefault: true,
		enabled: !drawersState.isOpen('tts-settings') && !drawersState.isOpen('settings')
	}); */
</script>

<div class="top-bar">
	<button onclick={handleBackNavigation} class="back-navigation"><Icon name="ArrowLeft" /></button>

	<button type="button" class="favicon-btn" aria-label="Navigate back">
		{#if faviconSrc}
			<img class="favicon" src={faviconSrc} alt="" />
		{:else}
			<Icon name="ClipboardType" />
		{/if}
	</button>

	{@render children?.()}
</div>

<style>
	.top-bar {
		color: white;
		display: flex;
		position: fixed;
		top: 0px;
		flex-direction: row;
		justify-content: space-between;
		align-items: center;
		gap: 10px;
		-webkit-backdrop-filter: blur(10px);
		backdrop-filter: blur(10px);
		background: color-mix(in srgb, var(--primary-color) 10%, transparent);
		min-height: 30px;
		right: 0;
		left: 0;
		z-index: 10;
		box-sizing: border-box;
		padding-right: 2em;
		border-bottom-left-radius: 3px;
		border-bottom-right-radius: 3px;
	}

	.top-bar::after {
		content: '';
		position: absolute;
		bottom: 0;
		right: 0;
		width: 100%;
		height: 1px;
		background: linear-gradient(
			270deg,
			color-mix(in srgb, var(--primary-color) 1%, transparent) 0%,
			color-mix(in srgb, var(--primary-color) 90%, transparent) 50%,
			color-mix(in srgb, var(--primary-color) 1%, transparent) 100%,
			transparent 100%
		);
		border-radius: 0 0 30px 0;
	}

	.back-navigation {
		all: unset;
		cursor: pointer;
		border-radius: 8px;
		padding: 0px 5px;
		font-size: 25px;
		text-decoration: none;
	}

	.favicon-btn {
		all: unset;
		cursor: pointer;
		margin-right: auto;
		border-radius: 8px;
		padding: 0;
		display: inline-flex;
		align-items: center;
	}

	.favicon {
		border-radius: 8px;
		width: 20px;
		height: 20px;
	}

	.favicon-placeholder {
		border-radius: 8px;
		width: 28px;
		height: 28px;
		background: color-mix(in srgb, var(--primary-color) 15%, transparent);
	}
</style>
