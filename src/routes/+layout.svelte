<script lang="ts">
	import { viewState, drawersState, voiceWheelState } from '@/stores/viewStore.svelte';
	import { onMount } from 'svelte';
	import { invoke } from '@tauri-apps/api/core';

	import { afterNavigate } from '$app/navigation';
	import TTSPlayer from '@/components/TTSPlayer.svelte';
	import ConversationMode from '@/components/ConversationMode.svelte';
	import ConversationSettings from '@/components/ConversationSettings.svelte';
	import PodcastMode from '@/features/podcast/PodcastMode.svelte';
	import PodcastSettings from '@/features/podcast/PodcastSettings.svelte';
	import TaskWorkflowEditor from '@/components/Tasks/TaskWorkflowEditor.svelte';
	import { ttsState } from '@/stores/ttsStore.svelte';
	import { mainVoiceState } from '@/stores/mainVoice.svelte';

	import VoiceProfileWheel from '@/components/modals/VoiceProfileWheel.svelte';
	import SettingsModal from '@/components/modals/SettingsModal.svelte';
	import DownloadPanel from '@/components/DownloadPanel.svelte';
	import Drawer from '@/components/Drawer.svelte';
	import Modal from '@/components/Modal.svelte';
	import { createHotkey } from '@tanstack/svelte-hotkeys';
	import { ensureAudioContext } from '@/lib/audioContextManager';
	import { workflowStore } from '@/stores/workflowStore.svelte';
	import { handlePasteUrl } from '@/lib/utils/pasteUrl';

	const CLIPBOARD_POLL_INTERVAL_MS = 3000;

	let { children } = $props();

	let flashy = $state(false);
	let mainElement: HTMLElement | undefined = $state();
	let conversationMode = $state(false);
	let podcastMode = $state(false);

	$effect(() => {
		const color = viewState.primaryColor;
		document.documentElement.style.setProperty('--primary-color', color);
	});

	$effect(() => {
		const bgColor = viewState.backgroundColor;
		document.documentElement.style.setProperty('--bg-color', bgColor);
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
		const ttsActive =
			ttsState.isPlaying ||
			ttsState.isPaused ||
			ttsState.isGenerating ||
			ttsState.addVoiceLoading ||
			!!ttsState.errorMessage;

		if (ttsActive) {
			viewState.ttsPlayerMode = 'mini';
		} else {
			ttsState.clearPlaylist();
		}
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
			voiceWheelState.open ||
			drawersState.isOpen('settings') ||
			drawersState.isOpen('downloads') ||
			conversationMode ||
			podcastMode
	);

	createHotkey(
		',',
		() => {
			void mainVoiceState.toggle();
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

	createHotkey(
		'P',
		() => {
			podcastMode = !podcastMode;
		},
		() => ({
			ignoreInputs: true,
			stopPropagation: true,
			preventDefault: true,
			enabled: !podcastMode
		})
	);

	let consecutiveClipboardErrors = 0;
	const MAX_CONSECUTIVE_CLIPBOARD_ERRORS = 5;

	onMount(() => {
		let clipboardInterval: ReturnType<typeof setInterval>;

		async function pollClipboard() {
			if (!viewState.clipboardPollingEnabled) return;
			if (viewState.processingUrl && !viewState.downloadTracksEnabled) return;

			try {
				const clipboardText = await invoke<string>('read_clipboard_text');
				consecutiveClipboardErrors = 0;
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
					if (viewState.downloadTracksEnabled) {
						await handlePasteUrl(trimmed);
						return;
					}
					if (
						viewState.forceLanguageEnabled ||
						viewState.urlQueue.length < viewState.maxUrlQueueSize
					) {
						viewState.urlQueue.push(trimmed);
					}
					viewState.lastHandledClipboardUrl = trimmed;
					return;
				}

				await handlePasteUrl(trimmed);
			} catch (error) {
				consecutiveClipboardErrors += 1;
				console.warn('[clipboard-poll] error', {
					attempt: consecutiveClipboardErrors,
					error
				});
				if (consecutiveClipboardErrors >= MAX_CONSECUTIVE_CLIPBOARD_ERRORS) {
					viewState.clipboardPollingEnabled = false;
					console.warn(
						'[clipboard-poll] disabled after',
						MAX_CONSECUTIVE_CLIPBOARD_ERRORS,
						'consecutive failures'
					);
				}
			}
		}

		void pollClipboard();
		clipboardInterval = setInterval(() => {
			void pollClipboard();
		}, CLIPBOARD_POLL_INTERVAL_MS);

		function handleVisible() {
			if (document.visibilityState === 'visible') {
				void pollClipboard();
			}
		}
		document.addEventListener('visibilitychange', handleVisible);
		window.addEventListener('focus', handleVisible);

		return () => {
			clearInterval(clipboardInterval);
			document.removeEventListener('visibilitychange', handleVisible);
			window.removeEventListener('focus', handleVisible);
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
	class:embeddings-processed={viewState.embeddingsProcessed}
>
	{@render children()}
</main>

<!-- <TasksStatusBar /> -->

<TaskWorkflowEditor />

<TTSPlayer bind:mode={viewState.ttsPlayerMode} />

<VoiceProfileWheel
	show={voiceWheelState.open}
	mode={voiceWheelState.mode}
	profiles={voiceWheelState.profiles}
	chunks={voiceWheelState.chunks}
	initial={voiceWheelState.selection}
	onCommit={(sel) => {
		voiceWheelState.commit(sel);
		voiceWheelState.close();
	}}
	onClose={() => voiceWheelState.close()}
	onChunksChanged={voiceWheelState.onChunksChanged}
	onAddVoice={() => mainVoiceState.runAddVoice()}
	onSaveProfile={(id, name, image) => mainVoiceState.saveProfile(id, name, image)}
	onDeleteProfile={(id) => mainVoiceState.deleteProfile(id)}
/>

{#if ttsState.lastVoiceChunkIndex !== null}
	<div class="tts-chunk-log">
		{ttsState.lastVoiceChunkIndex >= 0
			? `Voice: #${ttsState.lastVoiceChunkIndex}`
			: 'Voice: default'}
	</div>
{/if}

{#if conversationMode}
	<ConversationMode onExit={() => (conversationMode = false)} />
{/if}

{#if podcastMode}
	<PodcastMode onExit={() => (podcastMode = false)} />
{/if}

<Modal show={drawersState.isOpen('settings')} onClose={() => drawersState.close('settings')}>
	<SettingsModal />
</Modal>

<Drawer name="conversation-settings">
	<ConversationSettings />
</Drawer>

<Modal
	show={drawersState.isOpen('podcast-settings')}
	onClose={() => drawersState.close('podcast-settings')}
>
	<PodcastSettings />
</Modal>

<Drawer name="downloads">
	<DownloadPanel />
</Drawer>

<style>
	:global(body) {
		margin: 0;
		font-size: 14px;
		font-family: 'Anonymous Pro', monospace;
	}

	@font-face {
		font-family: 'Oswald';
		src: url('/Oswald-VariableFont_wght.ttf') format('truetype');
		font-weight: normal;
		font-style: normal;
	}

	@font-face {
		font-family: 'Silkscreen';
		src: url('/Silkscreen-Regular.ttf') format('truetype');
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

		--radius-sm: 4px;
		--radius-md: 8px;
		--radius-lg: 12px;

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
		background-image: linear-gradient(
			180deg,
			rgba(0, 0, 0),
			rgba(0, 0, 0),
			color-mix(in srgb, var(--bg-color) 40%, transparent)
		);
		background-size: 100% 150%;
		background-attachment: fixed;
		overflow-y: auto;
		scrollbar-gutter: stable;
		height: 100vh;
		padding: 3rem;
		padding-top: 1.5rem;
		scroll-behavior: smooth;
		scroll-padding-top: 5rem;
		transition: filter 300ms cubic-bezier(0.4, 0, 0.2, 1);
		border-bottom: none;
		border-top: none;
		padding-bottom: 10rem;
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
			var(--bg-color) 20%,
			rgba(255, 255, 255, 0) 70%,
			rgba(255, 255, 255, 0) 100%
		);
		pointer-events: none;
		content: '';
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
</style>
