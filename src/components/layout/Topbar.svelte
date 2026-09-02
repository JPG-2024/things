<script lang="ts">
	import type { Snippet } from 'svelte';
	import { goto } from '$app/navigation';
	/* import { createHotkey } from '@tanstack/svelte-hotkeys'; */
	import { viewState } from '@/stores/viewStore.svelte';
	import { downloadFavicon } from '@/lib/urlRouter/faviconDownloader';
	import { autoHide } from '@/lib/actions/autoHide';
	import Icon from '@/components/Icon.svelte';
	import { scrapStore } from '@/stores/scrapStore.svelte';
	import { getMediaSrc } from '@/lib/utils/files';
	interface Props {
		children?: Snippet;
		autoHide?: boolean;
		loading?: boolean;
	}

	let { children, autoHide: autoHideEnabled = true, loading = false }: Props = $props();

	let faviconSrc = $state<string | null>(null);
	let profileSrc = $state<string | null>(null);

	$effect(() => {
		const pic = scrapStore.currentYoutubeProfile?.profileImage;
		if (!pic) {
			profileSrc = null;
			return;
		}
		let active = true;
		getMediaSrc(pic)
			.then((src) => {
				if (active) profileSrc = src;
			})
			.catch(() => {
				if (active) profileSrc = null;
			});
		return () => {
			active = false;
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

<div class="top-bar" use:autoHide={{ enabled: autoHideEnabled }}>
	<button onclick={handleBackNavigation} class="back-navigation"><Icon name="ArrowLeft" /></button>

	<button type="button" class="favicon-btn" aria-label="Navigate back">
		{#if faviconSrc}
			<img class="favicon" src={faviconSrc} alt="" />
		{:else}
			<Icon name="ClipboardType" />
		{/if}
	</button>

	{#if profileSrc}
		<img class="profile-pic" src={profileSrc} alt="" />
	{/if}

	{@render children?.()}

	<div class="topbar-progress" class:is-loading={loading}></div>
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
		background: color-mix(in srgb, var(--bg-color), black 90%);
		min-height: 30px;
		right: 0;
		left: 0;
		z-index: 10;
		padding: 0.5rem 1.5rem;
		box-sizing: border-box;
		border-bottom-left-radius: 3px;
		border-bottom-right-radius: 3px;
		transform: translateY(0);
		opacity: 1;
		transition:
			transform 250ms ease-out,
			opacity 250ms ease-out;
	}

	.top-bar:global(.hidden) {
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
			color-mix(in srgb, var(--bg-color) 1%, transparent) 0%,
			color-mix(in srgb, var(--bg-color) 90%, transparent) 50%,
			color-mix(in srgb, var(--bg-color) 1%, transparent) 100%,
			transparent 100%
		);
		border-radius: 0 0 30px 0;
	}

	.back-navigation {
		all: unset;
		cursor: pointer;
		border-radius: var(--radius-md);
		padding: 0px 5px;
		font-size: 25px;
		text-decoration: none;
	}

	.favicon-btn {
		all: unset;
		cursor: pointer;
		border-radius: var(--radius-md);
		padding: 0;
		display: inline-flex;
		align-items: center;
		left: 0;
	}

	.favicon {
		border-radius: var(--radius-md);
		width: 20px;
		height: 20px;
	}

	.profile-pic {
		border-radius: var(--radius-md);
		width: 20px;
		height: 20px;
	}

	.favicon-placeholder {
		border-radius: var(--radius-md);
		width: 28px;
		height: 28px;
		background: color-mix(in srgb, var(--bg-color) 15%, transparent);
	}

	.topbar-progress {
		position: absolute;
		bottom: 0;
		left: -100%;
		width: 100%;
		height: 2px;
		background: linear-gradient(90deg, transparent, var(--bg-color, #7c6af7), transparent);
		opacity: 0;
		transition: opacity 0.2s;
	}

	.topbar-progress.is-loading {
		opacity: 1;
		animation: topbar-progress 1.2s linear infinite;
	}

	@keyframes topbar-progress {
		from {
			left: -100%;
		}
		to {
			left: 100%;
		}
	}
</style>
