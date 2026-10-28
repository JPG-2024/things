<script lang="ts">
	import {
		viewState,
		drawersState,
		voiceSettingsState,
		articleFilters
	} from '@/stores/viewStore.svelte';
	import { onMount } from 'svelte';
	import { listen } from '@tauri-apps/api/event';

	import { afterNavigate, onNavigate } from '$app/navigation';
	import TTSPlayer from '@/components/TTSPlayer/TTSPlayer.svelte';
	import FloatingYouTubePlayer from '@/components/youtube/FloatingYouTubePlayer.svelte';
	import ConversationMode from '@/components/ConversationMode.svelte';
	import ConversationSettings from '@/components/ConversationSettings.svelte';
	import { ttsState } from '@/stores/ttsStore.svelte';
	import { startSettingsPersistence } from '@/stores/settingsStore.svelte';
	import { ensureLlamaServers } from '@/lib/utils/llamaHealth';
	import { LLAMA_AUTOSTART_DELAY_MS } from '@/constants';
	import { generateTTSfromArticleURL } from '@/lib/utils/tts';
	import { ensureAudioContext } from '@/lib/audioContextManager';
	import { hashText } from '@/lib/utils/ttsTargets';
	import { installTargetPointerTracking } from '@/lib/utils/ttsTargetTracker';
	import { installWheelHistoryNavigation } from '@/lib/utils/wheelHistoryNavigation';

	import SettingsModal from '@/components/modals/SettingsModal.svelte';
	import DownloadModal from '@/components/DownloadModal.svelte';
	import Drawer from '@/components/Drawer.svelte';
	import Modal from '@/components/Modal.svelte';
	import ChatModal from '@/components/ChatModal.svelte';
	import DevFps from '@/components/DevFps.svelte';
	import { createHotkey } from '@tanstack/svelte-hotkeys';
	import {
		GLOBAL_CLIPBOARD_TRIGGER_EVENT,
		GLOBAL_CLIPBOARD_TRIGGER_LABEL,
		readClipboardAndHandle
	} from '@/lib/utils/clipboard';
	import { globalShortcutStore } from '@/stores/globalShortcutStore.svelte';
	import Button from '@/components/inputs/Button.component.svelte';
	import { selectedArticlesStore } from '@/stores/selectedArticlesStore.svelte';
	import { recordNavigation } from '@/stores/navigationHistory.svelte';
	import { VIEW_TRANSITIONS_ENABLED } from '@/lib/utils/vtNames';
	import { page } from '$app/state';

	let { children } = $props();

	let flashy = $state(false);
	let mainElement: HTMLElement | undefined = $state();
	let conversationMode = $state(false);
	let chatOpen = $state(false);

	// First-run offer for the OS-global clipboard shortcut. It is only shown
	// when the shortcut is not already bound, and registration waits for a user
	// gesture so the desktop dialog never appears on its own.
	let shortcutPromptVisible = $state(false);
	// True when the shortcut was previously set up but is no longer bound (the
	// user removed it in the desktop settings), so the banner re-offers it.
	let shortcutReoffer = $state(false);

	async function enableShortcut(): Promise<void> {
		if (await globalShortcutStore.register()) {
			shortcutPromptVisible = false;
		}
	}

	function dismissShortcutPrompt(): void {
		shortcutPromptVisible = false;
	}

	/**
	 * Reuses an existing binding silently; otherwise offers to bind it. Never
	 * calls the binding path on its own, so the desktop dialog is user-driven.
	 */
	async function initGlobalShortcut(): Promise<void> {
		if (await globalShortcutStore.probe()) return;

		// Unsupported platform/portal: stay quiet instead of offering a shortcut
		// that can never be registered on this system.
		if (!globalShortcutStore.supported) return;

		// The user already opted in but the probe found no binding. Re-bind
		// silently; the desktop only opens its dialog if the binding was removed
		// in the meantime, which is the intended re-offer.
		if (viewState.globalShortcutConsented) {
			if (await globalShortcutStore.register()) return;
			shortcutReoffer = true;
		}

		shortcutPromptVisible = true;
	}

	$effect(() => {
		const color = viewState.primaryColor;
		document.documentElement.style.setProperty('--primary-color', color);
	});

	$effect(() => {
		const bgColor = viewState.backgroundColor;
		document.documentElement.style.setProperty('--bg-color', bgColor);
	});

	// Glow switch: `html.glow-off` neutralizes text-shadow (blanket override
	// below) and the `--glow-filter` icon drop-shadows.
	$effect(() => {
		document.documentElement.classList.toggle('glow-off', !viewState.glowEnabled);
	});

	/* 	$effect(() => {
		if (mainElement === undefined) return;

		mainElement.scrollTop = 100;

		if (viewState.loaded && mainElement) {
			setTimeout(() => {
				if (mainElement === undefined) return;
				mainElement.scrollTop = 0;
			}, 200);
		} 
	}); */

	// Wrap client-side navigations in a View Transition so elements that share
	// a `view-transition-name` across routes (e.g. the article/YouTube
	// thumbnail) morph into each other. SvelteKit has no built-in integration;
	// this is the documented `onNavigate` pattern.
	//
	// DISABLED: on WebKitGTK (Tauri's Linux webview) calling
	// `document.startViewTransition()` as the first trigger of accelerated
	// compositing SIGSEGVs the UI process — a release-build null-pointer crash,
	// not our code. See https://bugs.webkit.org/show_bug.cgi?id=321683
	// (and https://bugs.webkit.org/show_bug.cgi?id=323949). It reproduces on
	// WebKitGTK 2.52.6 (Ubuntu 26.04) regardless of
	// WEBKIT_DISABLE_DMABUF_RENDERER. Flip to true once Ubuntu ships a patched
	// WebKitGTK; the morph anchors (toThumbnailVTName) are already in place.
	//
	// The flag lives in `lib/utils/vtNames` because the `view-transition-name`
	// anchors are only applied while it is on: marking every thumbnail of a
	// wheel costs compositing work for nothing.
	onNavigate((navigation) => {
		if (!VIEW_TRANSITIONS_ENABLED) return;
		if (!document.startViewTransition) return;
		return new Promise<void>((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});

	afterNavigate((navigation) => {
		recordNavigation(navigation.from?.url ?? null, navigation.to?.url ?? null);

		const ttsActive =
			ttsState.isPlaying ||
			ttsState.isPaused ||
			ttsState.isGenerating ||
			ttsState.addVoiceLoading ||
			!!ttsState.errorMessage;

		if (!ttsActive) {
			ttsState.clearPlaylist();
		}

		selectedArticlesStore.clear();
	});

	const ttsPlayerVisible = $derived(
		ttsState.isPlaying ||
			ttsState.isPaused ||
			ttsState.isGenerating ||
			ttsState.addVoiceLoading ||
			!!ttsState.errorMessage
	);

	const blurActive = $derived(
		ttsPlayerVisible ||
			voiceSettingsState.ttsOpen ||
			drawersState.isOpen('settings') ||
			drawersState.isOpen('downloads') ||
			conversationMode ||
			chatOpen
	);

	// Mirror the overlay state into the store so descendant components (e.g.
	// MasonryGrid) can gate their hotkeys without prop drilling.
	$effect(() => {
		viewState.overlayOpen = blurActive;
	});

	createHotkey(
		',',
		() => {
			voiceSettingsState.toggleTts();
		},
		{
			ignoreInputs: true
		}
	);

	createHotkey(
		'.',
		() => {
			drawersState.toggle('settings');
		},
		{
			ignoreInputs: true
		}
	);

	// F toggles the ArticleFilters left panel column. Closing always wins
	// over the overlay guard so F also dismisses the panel.
	createHotkey(
		'F',
		() => {
			if (articleFilters.filtersPanelVisible) {
				articleFilters.filtersPanelVisible = false;
				return;
			}
			if (viewState.overlayOpen) return;
			void articleFilters.openFiltersPanel();
		},
		{
			ignoreInputs: true,
			stopPropagation: true,
			preventDefault: true
		}
	);

	createHotkey(
		'M',
		() => {
			conversationMode = !conversationMode;
		},
		{
			ignoreInputs: true,
			stopPropagation: true,
			preventDefault: true
		}
	);

	createHotkey(
		'D',
		() => {
			const url = viewState.hoveredArticleUrl;
			if (url) selectedArticlesStore.toggle(url);
		},
		() => ({
			enabled:
				viewState.hoveredArticleUrl !== null &&
				!(page.url.pathname === '/' && viewState.activeProfileArticleTab === 'categories') &&
				!voiceSettingsState.ttsOpen &&
				!drawersState.isOpen('settings') &&
				!drawersState.isOpen('downloads') &&
				!conversationMode,
			ignoreInputs: true,
			preventDefault: true,
			stopPropagation: true
		})
	);

	createHotkey(
		'Shift+D',
		async () => {
			await selectedArticlesStore.deleteSelected();
		},
		() => ({
			enabled:
				selectedArticlesStore.selectedUrls.size > 0 &&
				!voiceSettingsState.ttsOpen &&
				!drawersState.isOpen('settings') &&
				!drawersState.isOpen('downloads') &&
				!conversationMode &&
				!(page.url.pathname === '/' && viewState.activeProfileArticleTab === 'categories'),
			ignoreInputs: true,
			preventDefault: true,
			stopPropagation: true
		})
	);

	// S speaks what is under the pointer: a registered markdown block wins over
	// the hovered article card, which keeps its previous behavior (summary).
	// It lives here instead of `+page.svelte` so every route gets it, including
	// the ones rendering AnalysisPanel / FullContentModal / ChatModal.
	createHotkey(
		'S',
		async () => {
			const target = ttsState.hoveredTarget;
			if (target) {
				const text = target.getText();
				if (!text.trim()) return;
				void ensureAudioContext();
				// The id hashes the text, so re-pressing on unchanged content
				// replays the cache while content that changed since the last
				// press regenerates.
				ttsState.setTextContents([text]);
				await ttsState.generateTTS(`target:${target.id}:${hashText(text)}`);
				return;
			}
			const url = viewState.hoveredArticleUrl;
			if (!url) return;
			void ensureAudioContext();
			await generateTTSfromArticleURL(url);
		},
		() => ({
			enabled: ttsState.hoveredTargetId !== null || viewState.hoveredArticleUrl !== null,
			ignoreInputs: true
		})
	);

	createHotkey(
		'Escape',
		() => {
			if (articleFilters.filtersPanelVisible) {
				articleFilters.filtersPanelVisible = false;
				return;
			}
			selectedArticlesStore.clear();
		},
		() => ({
			enabled:
				articleFilters.filtersPanelVisible ||
				(selectedArticlesStore.selectedUrls.size > 0 && !chatOpen),
			ignoreInputs: true,
			preventDefault: true,
			stopPropagation: true
		})
	);

	createHotkey(
		'Control+Space',
		() => {
			chatOpen = !chatOpen;
		},
		() => ({
			enabled:
				!voiceSettingsState.ttsOpen &&
				!drawersState.isOpen('settings') &&
				!drawersState.isOpen('downloads') &&
				!drawersState.isOpen('conversation-settings') &&
				!conversationMode,
			ignoreInputs: true,
			preventDefault: true,
			stopPropagation: true
		})
	);

	onMount(() => {
		startSettingsPersistence();
		// BOOT-3: defer the llama autostart (model reconciliation + server spawn)
		// so it does not compete with the first render and the initial page
		// fetches.
		if (viewState.llamaAutoStart) {
			const timer = setTimeout(() => void ensureLlamaServers(), LLAMA_AUTOSTART_DELAY_MS);
			return () => clearTimeout(timer);
		}
	});

	onMount(() => {
		// Tracks which markdown block is under the pointer for the S hotkey.
		return installTargetPointerTracking();
	});

	onMount(() => {
		// Shift+wheel walks the in-app history (down = back, up = forward).
		return installWheelHistoryNavigation();
	});

	onMount(() => {
		let unlisten: (() => void) | undefined;
		let disposed = false;

		void listen(GLOBAL_CLIPBOARD_TRIGGER_EVENT, () => {
			void readClipboardAndHandle();
		}).then((cleanup) => {
			if (disposed) {
				cleanup();
			} else {
				unlisten = cleanup;
			}
		});

		void initGlobalShortcut();

		return () => {
			disposed = true;
			unlisten?.();
		};
	});
</script>

<main
	id="layout-main"
	bind:this={mainElement}
	class="container"
	class:blur-active={blurActive}
	class:flashy
	class:embeddings-processed={viewState.embeddingsProcessed}
>
	{@render children()}
</main>

<DevFps />

{#if shortcutPromptVisible}
	<aside class="shortcut-prompt" role="region" aria-label="Global clipboard shortcut">
		<p>
			{#if shortcutReoffer}
				The global clipboard shortcut is not active. Enable it to send the clipboard to Things with <kbd
					>{globalShortcutStore.trigger ?? GLOBAL_CLIPBOARD_TRIGGER_LABEL}</kbd
				>.
			{:else}
				Use <kbd>{globalShortcutStore.trigger ?? GLOBAL_CLIPBOARD_TRIGGER_LABEL}</kbd> from any app to
				send the clipboard to Things. Your desktop will ask you to confirm it once.
			{/if}
		</p>
		{#if globalShortcutStore.error}
			<p class="shortcut-prompt-error">{globalShortcutStore.error}</p>
		{/if}
		<div class="shortcut-prompt-actions">
			<Button onClick={dismissShortcutPrompt} disabled={globalShortcutStore.busy}>Not now</Button>
			<Button onClick={() => void enableShortcut()} disabled={globalShortcutStore.busy}>
				{globalShortcutStore.busy ? 'Enabling…' : 'Enable shortcut'}
			</Button>
		</div>
	</aside>
{/if}

<!-- <TasksStatusBar /> -->

<TTSPlayer />

<FloatingYouTubePlayer />

<!-- {#if ttsState.lastVoiceChunkIndex !== null}
	<div class="tts-chunk-log">
		{ttsState.lastVoiceChunkIndex >= 0
			? `Voice: #${ttsState.lastVoiceChunkIndex}`
			: 'Voice: default'}
	</div>
{/if} -->

{#if conversationMode}
	<ConversationMode onExit={() => (conversationMode = false)} />
{/if}

<Modal show={drawersState.isOpen('settings')} onClose={() => drawersState.close('settings')}>
	<SettingsModal />
</Modal>

<Drawer name="conversation-settings">
	<ConversationSettings />
</Drawer>

{#if drawersState.isOpen('downloads')}
	<DownloadModal />
{/if}

{#if chatOpen}
	<ChatModal onExit={() => (chatOpen = false)} />
{/if}

<style>
	:global(body) {
		margin: 0;
		font-size: 14px;
		font-family: 'MonaspaceXenonFrozen', monospace;
		border: 1px solid var(--gray-300);
	}

	@font-face {
		font-family: 'BetterVCR';
		src: url('/BetterVCR 25.09.ttf') format('truetype');
		font-weight: normal;
		font-style: normal;
	}

	@font-face {
		font-family: 'MonaspaceXenonFrozen';
		src: url('/MonaspaceXenonFrozen-Light.ttf') format('truetype');
		font-weight: normal;
		font-style: normal;
	}

	@font-face {
		font-family: 'MonaspaceXenonFrozenBold';
		src: url('/MonaspaceXenonFrozen-Bold.ttf') format('truetype');
		font-weight: bold;
		font-style: normal;
	}

	*,
	*::before,
	*::after {
		box-sizing: border-box;
	}

	:root {
		line-height: 24px;
		font-family: Inter, Avenir, Helvetica, Arial, sans-serif;

		--card-border-weigth: 1px;

		--font-secondary: 'BetterVCR', monospace;
		--font-primary-bold: 'MonaspaceXenonFrozenBold';

		--radius-sm: 6px;
		--radius-md: 10px;
		--radius-lg: 14px;

		/* Floating corner widget: the minimized YouTube thumbnail and the TTS
		 * strip share this geometry so they stay stacked as one piece. */
		--float-anchor-right: 1.5rem;
		--float-anchor-bottom: 1.3rem;
		--float-mini-width: 260px;
		--float-mini-height: 146px; /* 260 * 9/16 — keep in sync with the width */

		--glow-sm: drop-shadow(0 0 5px color-mix(in srgb, white 80%, transparent));
		--glow-md: drop-shadow(0 0 10px color-mix(in srgb, white 40%, transparent));
		--glow-lg: drop-shadow(0 0 15px color-mix(in srgb, white 40%, transparent));

		/* The whole icon-glow filter as one value so the toolbar toggle can
		 * collapse it to `none` (a blanket `filter: none !important` would also
		 * kill unrelated filters such as the emoji tint). */
		--glow-filter: var(--glow-sm) var(--glow-md) var(--glow-lg);

		--glow-text:
			0 0 5px color-mix(in srgb, var(--primary-color) 55%, transparent),
			0 0 10px color-mix(in srgb, var(--primary-color) 40%, transparent),
			0 0 15px color-mix(in srgb, white 40%, transparent);

		--gray-100: rgb(219, 219, 219);
		--gray-200: rgb(196, 194, 194);
		--gray-300: rgb(118, 118, 118);

		--article-border: rgba(120, 119, 119, 0.3);

		color: var(--gray-100);

		font-synthesis: none;
		text-rendering: optimizeLegibility;
		-webkit-font-smoothing: antialiased;
		-moz-osx-font-smoothing: grayscale;
		-webkit-text-size-adjust: 100%;
	}

	/* Glow switch (dashboard toolbar toggle). `html.glow-off` collapses the icon
	 * drop-shadow filter to `none` and the rule below blanks every text-shadow
	 * in one place instead of editing each component. `:global` keeps Svelte
	 * from scoping the selectors onto elements of this component only. */
	:global(html.glow-off) {
		--glow-filter: none;
	}

	:global(html.glow-off *),
	:global(html.glow-off *::before),
	:global(html.glow-off *::after) {
		text-shadow: none !important;
	}

	main {
		display: flex;
		position: relative;
		flex-direction: column;
		align-items: center;
		gap: 1.5rem;
		box-sizing: border-box;
		margin: 0;
		overflow-y: auto;
		/* scrollbar-gutter: stable; */
		height: 100vh;
		/* scroll-behavior: smooth removed: it glided every programmatic scroll
		 * (goto, scrollIntoView, anchor restores) over many frames, reading as
		 * lag after navigation. scroll-padding-top still applies. */
		scroll-padding-top: 5rem;
		/* transition: filter 300ms cubic-bezier(0.4, 0, 0.2, 1); */
		border-bottom: none;
		border-top: none;
	}

	/* Background layer: painted on a viewport-fixed pseudo-element instead of
	 * `background-attachment: fixed` on `main`. The attachment mode forces a
	 * full repaint of the element's background on every scroll step; a fixed
	 * pseudo-element paints once and lets the compositor scroll over it.
	 * z-index: -1 keeps it behind `main`'s children (which carry z-index: 1
	 * via `main > *`); `main` itself has no background so the layer shows. */
	main::before {
		position: fixed;
		inset: 0;
		z-index: -1;
		pointer-events: none;
		background-image: linear-gradient(
			180deg,
			rgba(0, 0, 0),
			rgba(0, 0, 0),
			color-mix(in srgb, var(--bg-color) 30%, transparent)
		);
		background-size: 100% 150%;
		content: '';
	}

	main.blur-active {
		/* filter: v-bind('viewState.blur ? "blur(4px) opacity(0.7)" : "opacity(0.7)"'); */
	}

	main.embeddings-processed::after {
		position: fixed;
		transform: translateY(-120%);
		z-index: 9999;
		mix-blend-mode: screen;
		animation: sweep-overlay 1s ease-in-out forwards;
		inset: 0;
		background: linear-gradient(
			0deg,
			rgba(0, 255, 128, 0) 0%,
			rgba(0, 255, 128, 0) 20%,
			var(--bg-color) 30%,
			rgba(0, 255, 128, 0) 70%,
			rgba(0, 255, 128, 0) 100%
		);
		pointer-events: none;
		content: '';
	}

	.loading {
		animation: gradient 2s ease infinite;
	}

	.flashy {
		animation: flashy 2s ease-in-out infinite;
	}

	@keyframes sweep-overlay {
		from {
			transform: translateY(-100%);
		}
		to {
			transform: translateY(100%);
		}
	}

	@keyframes gradient {
		0% {
			background-position: 0% 50%;
		}
		50% {
			background-position: 10% 10%;
		}
		100% {
			background-position: 0% 50%;
		}
	}

	@keyframes flashy {
		0% {
			background-position: 0% 0%;
		}
		50% {
			background-position: 8% 5%;
		}
		100% {
			background-position: 0% 0%;
		}
	}

	main > * {
		position: relative;
		z-index: 1;
	}

	.tts-chunk-log {
		position: fixed;
		bottom: 1rem;
		right: 1rem;
		color: var(--primary-color);
		font-size: 0.7rem;
		max-width: 300px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		pointer-events: none;
		opacity: 0.8;
		z-index: 99999;
	}

	/* Tooltip singleton (`@/lib/actions/tooltip` creates one element for the
	 * whole app and portals it to `document.body`), so it lives outside any
	 * component's scope and needs global rules. */
	:global(.tooltip) {
		position: fixed;
		box-sizing: border-box;
		outline: none;
		border: none;
		border-radius: var(--radius-sm);
		/* No backdrop-filter: one element is fine, but a blur re-filters the
		 * backdrop on every frame while the pointer moves. */
		background: rgba(0, 0, 0, 0.92);
		color: var(--gray-100);
		padding: 0.4rem 0.7rem;
		font-family: var(--font-secondary);
		font-size: 0.8rem;
		white-space: pre-wrap;
		z-index: 9999;
		pointer-events: none;
		max-width: 600px;
		overflow: hidden;
		text-overflow: ellipsis;
		transform: translate(-50%, -100%);
		margin-top: -8px;
		opacity: 0;
		/* Hidden means "not painted": the element stays in the DOM (it is the
		 * shared portal) but costs no layer and no compositing work. */
		visibility: hidden;
		transition:
			opacity 0.15s,
			visibility 0.15s;
		word-wrap: break-word;
		font-weight: bold;
	}

	:global(.tooltip.visible) {
		opacity: 1;
		visibility: visible;
	}

	:global(.tooltip-bottom) {
		transform: translate(-50%, 0);
		margin-top: 8px;
	}

	:global(.tooltip-left) {
		transform: translate(-100%, -50%);
		margin-left: -8px;
	}

	:global(.tooltip-right) {
		transform: translate(0, -50%);
		margin-left: 8px;
	}

	/* Thin, unobtrusive scrollbars app-wide. */
	:global(::-webkit-scrollbar) {
		width: 4px;
		height: 4px;
	}

	:global(::-webkit-scrollbar-thumb) {
		background: rgba(255, 255, 255, 0.25);
		border-radius: 999px;
	}

	:global(::-webkit-scrollbar-track) {
		background: transparent;
	}

	:global(*) {
		scrollbar-width: thin;
		scrollbar-color: rgba(255, 255, 255, 0.25) transparent;
	}

	/* First-run offer for the OS-global clipboard shortcut. Sits above the app
	 * but below the modal layer, and never blocks the rest of the UI. */
	.shortcut-prompt {
		position: fixed;
		right: 1.5rem;
		bottom: 1.5rem;
		z-index: 9000;
		width: min(360px, calc(100vw - 3rem));
		padding: 1rem 1.1rem;
		border: 1px solid var(--article-border);
		border-radius: var(--radius-md);
		background: rgba(0, 0, 0, 0.92);
		backdrop-filter: blur(10px);
		font-size: 0.85rem;
		line-height: 1.4;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.shortcut-prompt p {
		margin: 0;
	}

	.shortcut-prompt kbd {
		font-family: var(--font-secondary);
		color: var(--primary-color);
		border: 1px solid var(--article-border);
		border-radius: var(--radius-sm);
		padding: 0.05rem 0.3rem;
	}

	.shortcut-prompt-error {
		color: #ff8a8a;
	}

	.shortcut-prompt-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}
</style>
