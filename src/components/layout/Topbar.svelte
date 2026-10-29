<script lang="ts">
	import type { Snippet } from 'svelte';
	/* import { createHotkey } from '@tanstack/svelte-hotkeys'; */
	import { viewState } from '@/stores/viewStore.svelte';
	import { articleState } from '@/stores/articleStore.svelte';
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

	const article = $derived(articleState.currentArticle);
	/**
	 * The article title, gated on `status === 'done'` — the uniform "the
	 * loader finished" signal for both a fresh run (set where `loaded` rises)
	 * and a plain open of a cached article (`loaded` stays false there). It
	 * reveals in sync with the topbar sweep.
	 */
	const readyTitle = $derived(article.status === 'done' ? article.title : null);

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

<div class="top-bar" class:loaded={viewState.loaded}>
	<div class="topbar-left">
		<button onclick={handleBackNavigation} class="back-navigation"><Icon name="ArrowLeft" /></button
		>

		<button type="button" class="favicon-btn" aria-label="Navigate back">
			{#if faviconSrc}
				<img class="favicon" src={faviconSrc} alt="" />
			{:else}
				<Icon name="ClipboardType" />
			{/if}
		</button>
	</div>

	{#if readyTitle}
		<div class="topbar-title" class:reveal={viewState.loaded}>{readyTitle}</div>
	{/if}

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
		background: color-mix(in srgb, var(--bg-color), black 90%);
		min-height: 30px;
		right: 0;
		left: 0;
		z-index: 10;
		padding: 0.6rem 1.5rem;
		box-sizing: border-box;
		border-bottom-left-radius: 3px;
		border-bottom-right-radius: 3px;
		border-left: 1px solid var(--primary-color);
		border-right: 1px solid var(--primary-color);
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

	/* One-shot sweep when an article finishes loading. Runs horizontally inside
	   the topbar (left → right) instead of the old full-screen overlay. */
	.top-bar.loaded::before {
		content: '';
		position: absolute;
		inset: 0;
		pointer-events: none;
		border-radius: inherit;
		mix-blend-mode: screen;
		background: linear-gradient(
			90deg,
			transparent 0%,
			transparent 35%,
			color-mix(in srgb, var(--primary-color) 60%, white) 10%,
			transparent 65%,
			transparent 100%
		);
		background-size: 45% 100%;
		background-repeat: no-repeat;
		animation: topbar-loaded-sweep 1.2s cubic-bezier(0.4, 0, 0.2, 1) forwards;
	}

	@keyframes topbar-loaded-sweep {
		from {
			background-position: -100% 0;
		}
		to {
			background-position: 200% 0;
		}
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

	/* Article title in the middle. `flex-grow` fills the space between the
	   left cluster and the toolbar, so the toolbar stays hugging the right. */
	.topbar-title {
		flex: 1 1 auto;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-family: var(--font-secondary);
		font-size: 0.95rem;
		font-variant: all-small-caps;
		padding: 0 0.25rem;
		text-align: center;
	}

	.topbar-title::after {
		content: '.';
	}

	/* Left→right wipe, matching the `.top-bar.loaded::before` sweep. Only
	   applied for a fresh run (`loaded` rises when the run ends): a plain open
	   of a cached article shows the title without the animation. */
	.topbar-title.reveal {
		animation: topbar-title-reveal 0.9s cubic-bezier(0.4, 0, 0.2, 1) both;
	}

	@keyframes topbar-title-reveal {
		from {
			clip-path: inset(0 100% 0 0);
		}
		to {
			clip-path: inset(0 0 0 0);
		}
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
