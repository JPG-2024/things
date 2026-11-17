<script lang="ts">
	import type { Snippet } from 'svelte';
	/* import { createHotkey } from '@tanstack/svelte-hotkeys'; */
	import { viewState } from '@/stores/viewStore.svelte';
	import { articleManager } from '@/runners/articleManager.svelte';
	import { downloadFavicon } from '@/lib/urlRouter/faviconDownloader';
	import Icon from '@/components/Icon.svelte';
	import { navigateBack } from '@/stores/navigationHistory.svelte';
	interface Props {
		children?: Snippet;
		loading?: boolean;
	}

	let { children, loading = false }: Props = $props();

	let faviconSrc = $state<string | null>(null);

	// The article manager's queue: true from the moment a run starts (or a
	// url waits in the queue) until the drain finishes, regardless of which
	// article is on screen.
	const processing = $derived(articleManager.processing);

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
		void navigateBack();
	}

	/* 	createHotkey('Escape', handleBackNavigation, {
		stopPropagation: true,
		preventDefault: true,
		enabled: !drawersState.isOpen('tts-settings') && !drawersState.isOpen('settings')
	}); */
</script>

<div class="top-bar">
	<div class="topbar-left">
		<button onclick={handleBackNavigation} class="back-navigation"
			><Icon name="ArrowLeft" color="var(--primary-color)" /></button
		>

		<button type="button" class="favicon-btn" aria-label="Navigate back">
			{#if faviconSrc}
				<img class="favicon" src={faviconSrc} alt="" />
			{:else}
				<Icon name="ClipboardType" />
			{/if}
		</button>
	</div>

	<div class="topbar-fill"></div>

	{@render children?.()}

	<div class="topbar-progress" class:is-loading={loading || processing}></div>
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
		/* 		background: linear-gradient(
			180deg,
			color-mix(in srgb, var(--primary-color) 25%, transparent) 1%,
			color-mix(in srgb, var(--primary-color) 10%, transparent) 50%,
			rgba(255, 255, 255, 0) 100%
		); */
		min-height: 30px;
		right: 0;
		left: 0;
		z-index: 10;
		padding: 1.2rem 1.5rem;
		padding-inline: var(--page-gutter-x);
		box-sizing: border-box;
	}

	.top-bar::after {
		content: '';
		position: absolute;
		bottom: 0;
		right: 0;
		width: 100%;
		height: 2px;
		/* 		background: linear-gradient(
			270deg,
			color-mix(in srgb, var(--bg-color) 1%, transparent) 0%,
			color-mix(in srgb, var(--bg-color) 20%, transparent) 50%,
			color-mix(in srgb, var(--bg-color) 1%, transparent) 100%,
			transparent 100%
		); */
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
		border-radius: var(--radius-sm);
		width: 30px;
		height: 30px;
	}

	.favicon-placeholder {
		border-radius: var(--radius-md);
		width: 28px;
		height: 28px;
		background: color-mix(in srgb, var(--bg-color) 15%, transparent);
	}

	/* Left cluster: the back arrow and the favicon stay together so the favicon
	   is pinned beside the back button even when no title fills the middle. */
	.topbar-left {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-shrink: 0;
	}

	/* Fill the space between the left cluster and any children (the toolbar),
	   so the toolbar keeps hugging the right edge now that the title no
	   longer grows into the gap. */
	.topbar-fill {
		flex: 1 1 auto;
	}

	/* The Toolbar's internal `width: 100%` would grab the middle away from the
	   title; keep it sized to its icons so the title can grow into the gap. */
	.top-bar > :global(.toolbar) {
		flex: 0 0 auto;
		width: auto;
	}

	.topbar-progress {
		position: absolute;
		bottom: 0;
		left: -100%;
		width: 100%;
		height: 2px;
		background: linear-gradient(90deg, transparent, var(--primary-color), transparent);
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
