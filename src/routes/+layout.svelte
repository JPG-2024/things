<script lang="ts">
	import { viewState } from '@/stores/viewStore.svelte';
	import { onMount } from 'svelte';
	import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
	import { invoke } from '@tauri-apps/api/core';
	import { urlRouter } from '@/lib/urlRouter/urlRouter';
	import { navigate } from '@/lib/utils/url';
	import { afterNavigate, onNavigate } from '$app/navigation';
	import TTSPlayer from '@/components/TTSPlayer.svelte';
	import TasksStatusBar from '@/components/Tasks/TasksStatusBar.svelte';
	import { ttsState } from '@/stores/ttsStore.svelte';
	import { prefetchHomeData } from '@/lib/prefetchHomeData';
	import { playCoinSound } from '@/lib/utils/coinSound';

	const CLIPBOARD_POLL_INTERVAL_MS = 5000;
	const HTTP_URL_REGEX = /^https?:\/\/\S+$/i;

	let { children } = $props();

	let flashy = $state(false);
	let mainElement: HTMLElement | undefined = $state();
	let processingUrl = $state(false);

	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: 1000 * 60 * 5
			}
		}
	});

	function extractValidUrl(value: string): string | null {
		const trimmedValue = value.trim();

		if (!trimmedValue || !HTTP_URL_REGEX.test(trimmedValue)) {
			return null;
		}

		try {
			const parsedUrl = new URL(trimmedValue);
			if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
				return null;
			}

			return parsedUrl.toString();
		} catch {
			return null;
		}
	}

	async function handlePasteUrl(url: string, replaceState = false) {
		const validUrl = extractValidUrl(url);
		if (!validUrl || processingUrl) return;

		processingUrl = true;

		try {
			viewState.lastHandledClipboardUrl = validUrl;
			navigate(`/youtube/${encodeURIComponent(validUrl)}`, { replaceState });
			await urlRouter(validUrl);
			queryClient.invalidateQueries({ queryKey: ['profiles'] });
			queryClient.invalidateQueries({ queryKey: ['articles'] });
			await prefetchHomeData(queryClient);
		} finally {
			processingUrl = false;
			await processQueue();
		}
	}

	async function processQueue() {
		while (viewState.urlQueue.length > 0) {
			const nextUrl = viewState.urlQueue.shift();
			if (!nextUrl) break;
			await handlePasteUrl(nextUrl, true);
		}
	}

	$effect(() => {
		const color = viewState.primaryColor;
		if (mainElement) {
			mainElement.style.setProperty('--primary-color', color);
		}
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

	afterNavigate(() => {
		ttsState.clearPlaylist();
	});

	onMount(() => {
		const pollClipboard = async () => {
			if (!viewState.clipboardPollingEnabled || processingUrl) return;

			try {
				const clipboardText = await invoke<string>('read_clipboard_text');
				const validUrl = extractValidUrl(clipboardText ?? '');

				if (!validUrl || validUrl === viewState.lastHandledClipboardUrl) {
					return;
				}

				if (processingUrl || viewState.loading) {
					if (viewState.urlQueue.length < viewState.maxUrlQueueSize) {
						viewState.urlQueue.push(validUrl);
					}
					return;
				}

				playCoinSound();

				await handlePasteUrl(validUrl);
			} catch {
				viewState.clipboardPollingEnabled = false;
			}
		};

		void pollClipboard();
		const clipboardInterval = setInterval(() => {
			void pollClipboard();
		}, CLIPBOARD_POLL_INTERVAL_MS);

		const flashyInterval = setInterval(() => {
			if (viewState.loading) return;

			flashy = true;
			setTimeout(() => {
				flashy = false;
			}, 2000);
		}, 18000);

		return () => {
			clearInterval(flashyInterval);
			clearInterval(clipboardInterval);
		};
	});
</script>

<QueryClientProvider client={queryClient}>
	<main
		id="layout-main"
		bind:this={mainElement}
		class="container"
		class:flashy
		class:loaded={viewState.loaded}
	>
		{@render children()}
		<TasksStatusBar />
		<TTSPlayer />
	</main>
</QueryClientProvider>

<style>
	:global(body) {
		margin: 0;
		font-size: 14px;
		font-family: 'CaskaydiaCove NFM Light', monospace;
	}

	@font-face {
		font-family: 'Oswald';
		src: url('/Oswald-VariableFont_wght.ttf') format('truetype');
		font-weight: normal;
		font-style: normal;
	}

	*,
	*::before,
	*::after {
		box-sizing: border-box;
	}

	:root {
		color: #ffffff;
		line-height: 24px;
		font-family: Inter, Avenir, Helvetica, Arial, sans-serif;

		font-synthesis: none;
		text-rendering: optimizeLegibility;
		-webkit-font-smoothing: antialiased;
		-moz-osx-font-smoothing: grayscale;
		-webkit-text-size-adjust: 100%;
	}

	main {
		display: flex;
		position: relative;
		flex-direction: column;
		align-items: center;
		gap: 1.5rem;
		box-sizing: border-box;
		margin: 0;
		background-image: linear-gradient(-45deg, var(--primary-color) 10%, rgba(0, 0, 0, 0.68) 90%);
		background-size: 400% 400%;
		background-attachment: fixed;
		background-color: #000000;
		overflow-y: auto;
		height: 100vh;
		padding: 1.5rem;
		scroll-behavior: smooth;
		scroll-padding-top: 2rem;
		border: 1px solid var(--primary-color);
		/* filter: blur(2px) opacity(0.7); */
		border-bottom: none;
		border-top: none;
	}

	main.loaded::after {
		position: fixed;
		transform: translateY(-120%);
		z-index: 9999;
		mix-blend-mode: screen;
		animation: sweep-overlay 1s ease-in-out forwards;
		inset: 0;
		background: linear-gradient(
			0deg,
			rgba(255, 255, 255, 0) 0%,
			rgba(255, 255, 255, 0) 20%,
			var(--primary-color) 30%,
			rgba(255, 255, 255, 0) 70%,
			rgba(255, 255, 255, 0) 100%
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
</style>
