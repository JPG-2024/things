<script lang="ts">
	import type { Snippet } from 'svelte';
	import { goto } from '$app/navigation';
	/* import { createHotkey } from '@tanstack/svelte-hotkeys'; */
	import { viewState } from '@/stores/viewStore.svelte';
	import { downloadFavicon } from '@/lib/urlRouter/faviconDownloader';
	import Icon from '@/components/Icon.svelte';
	import LuminousText from '@/components/LuminousText.svelte';
	interface Props {
		children?: Snippet;
		title?: string;
		autoHide?: boolean;
	}

	let { children, title, autoHide = true }: Props = $props();

	let faviconSrc = $state<string | null>(null);
	let isHidden = $state(false);
	let lastScrollY = 0;

	$effect(() => {
		if (!autoHide) return;

		const scrollContainer = document.getElementById('layout-main');
		if (!scrollContainer) return;

		function handleScroll() {
			const currentScrollY = scrollContainer!.scrollTop;
			const threshold = window.innerHeight * 0.1;

			if (currentScrollY > threshold) {
				if (currentScrollY > lastScrollY) {
					isHidden = true;
				} else {
					isHidden = false;
				}
			} else {
				isHidden = false;
			}

			lastScrollY = currentScrollY;
		}

		scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
		return () => {
			scrollContainer.removeEventListener('scroll', handleScroll);
		};
	});

	$effect(() => {
		if (!viewState.domainUrl || viewState.isRawMode) {
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

<div class="top-bar" class:hidden={isHidden}>
	<button onclick={handleBackNavigation} class="back-navigation"><Icon name="ArrowLeft" /></button>

	<button type="button" class="favicon-btn" aria-label="Navigate back">
		{#if faviconSrc}
			<img class="favicon" src={faviconSrc} alt="" />
		{:else}
			<Icon name="ClipboardType" />
		{/if}
	</button>

	{#if title}
		<div class="topbar-title">
			{title}
		</div>
	{/if}

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
		/* -webkit-backdrop-filter: blur(10px);
		backdrop-filter: blur(10px); */
		background: color-mix(in srgb, var(--primary-color), black 90%);
		min-height: 30px;
		right: 0;
		left: 0;
		z-index: 10;
		padding: 8px 10px;
		padding-right: 2em;
		box-sizing: border-box;
		border-bottom-left-radius: 3px;
		border-bottom-right-radius: 3px;
		transform: translateY(0);
		opacity: 1;
		transition:
			transform 250ms ease-out,
			opacity 250ms ease-out;
	}

	.top-bar.hidden {
		transform: translateY(-100%);
		opacity: 0;
		pointer-events: none;
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
		border-radius: 8px;
		padding: 0;
		display: inline-flex;
		align-items: center;
		left: 0;
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

	.topbar-title {
		margin-right: auto;
		max-width: 70vw;
		padding: 0.6rem;
	}
</style>
