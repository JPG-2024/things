<script lang="ts">
	import { viewState, drawersState } from '@/stores/viewStore.svelte';
	import { onMount } from 'svelte';
	import { invoke } from '@tauri-apps/api/core';

	import { afterNavigate } from '$app/navigation';
	import TTSPlayer from '@/components/TTSPlayer.svelte';
	import ConversationMode from '@/components/ConversationMode.svelte';
	import ConversationSettings from '@/components/ConversationSettings.svelte';
	import TasksStatusBar from '@/components/Tasks/TasksStatusBar.svelte';
	import { ttsState } from '@/stores/ttsStore.svelte';

	import { playCoinSound } from '@/lib/utils/coinSound';
	import TTSSettings from '@/components/modals/TTSSettings.svelte';
	import SettingsModal from '@/components/modals/SettingsModal.svelte';
	import Drawer from '@/components/Drawer.svelte';
	import { createHotkey } from '@tanstack/svelte-hotkeys';
	import { ensureAudioContext } from '@/lib/audioContextManager';
	import { workflowStore } from '@/stores/workflowStore.svelte';
	import { handlePasteUrl } from '@/lib/utils/pasteUrl';

	const CLIPBOARD_POLL_INTERVAL_MS = 5000;

	let { children } = $props();

	let flashy = $state(false);
	let mainElement: HTMLElement | undefined = $state();
	let conversationMode = $state(false);

	$effect(() => {
		const color = viewState.primaryColor;
		document.documentElement.style.setProperty('--primary-color', color);
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

	const ttsPlayerVisible = $derived(
		ttsState.isPlaying ||
			ttsState.isPaused ||
			ttsState.isGenerating ||
			ttsState.addVoiceLoading ||
			!!ttsState.errorMessage
	);

	const blurActive = $derived(
		ttsPlayerVisible ||
			drawersState.isOpen('tts-settings') ||
			drawersState.isOpen('settings') ||
			conversationMode
	);

	createHotkey(
		',',
		() => {
			drawersState.toggle('tts-settings');
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

	createHotkey(
		'Shift+S',
		async () => {
			if (!viewState.url) return;
			const entry = workflowStore.stackedTasks.find(
				({ task }) => task.id === viewState.selectedTaskId && task.status === 'done'
			);
			if (!entry?.task.data || typeof entry.task.data !== 'string') return;
			void ensureAudioContext();
			ttsState.setTextContents([entry.task.data]);
			await ttsState.forceRegenerate(viewState.url);
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

	onMount(() => {
		const pollClipboard = async () => {
			if (!viewState.clipboardPollingEnabled || viewState.processingUrl) return;

			try {
				const clipboardText = await invoke<string>('read_clipboard_text');
				const trimmed = (clipboardText ?? '').trim();

				if (!trimmed || trimmed === viewState.lastHandledClipboardUrl) {
					return;
				}

				if (viewState.clipboardTtsEnabled) {
					void ensureAudioContext();
					await ttsState.generateFromClipboard(trimmed);
					viewState.lastHandledClipboardUrl = trimmed;
					return;
				}

				if (viewState.processingUrl || viewState.loading) {
					if (viewState.urlQueue.length < viewState.maxUrlQueueSize) {
						viewState.urlQueue.push(trimmed);
					}
					return;
				}

				playCoinSound();

				await handlePasteUrl(trimmed);
			} catch {
				viewState.clipboardPollingEnabled = false;
			}
		};

		void pollClipboard();
		const clipboardInterval = setInterval(() => {
			void pollClipboard();
		}, CLIPBOARD_POLL_INTERVAL_MS);

		/* 		const flashyInterval = setInterval(() => {
			if (viewState.loading) return;

			flashy = true;
			setTimeout(() => {
				flashy = false;
			}, 2000);
		}, 18000); */

		return () => {
			//clearInterval(flashyInterval);
			clearInterval(clipboardInterval);
		};
	});
</script>

<main
	id="layout-main"
	bind:this={mainElement}
	class="container"
	class:blur-active={blurActive}
	class:flashy
	class:loaded={viewState.loaded}
>
	{@render children()}
</main>

<TasksStatusBar />

<TTSPlayer />

{#if conversationMode}
	<ConversationMode onExit={() => (conversationMode = false)} />
{/if}

<Drawer name="tts-settings">
	<TTSSettings />
</Drawer>

<Drawer name="settings">
	<SettingsModal />
</Drawer>

<Drawer name="conversation-settings">
	<ConversationSettings />
</Drawer>

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
		transition: filter 300ms cubic-bezier(0.4, 0, 0.2, 1);
		border-bottom: none;
		border-top: none;
	}

	main.blur-active {
		/* filter: v-bind('viewState.blur ? "blur(4px) opacity(0.7)" : "opacity(0.7)"'); */
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
