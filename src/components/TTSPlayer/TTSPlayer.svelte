<script lang="ts">
	import { onMount } from 'svelte';
	import { ttsState } from '@/stores/ttsStore.svelte';
	import { mainVoiceState } from '@/stores/mainVoice.svelte';
	import { getCurrentStyle, type PlayerMode } from '@/lib/ttsPlayerConfig';
	import { resetAudioContext } from '@/lib/audioContextManager';
	import type { WaveformDrawConfig } from '@/lib/canvasWaveform';
	import { createHotkey } from '@tanstack/svelte-hotkeys';
	import type { VoiceProfile } from '@/lib/utils/ttsService';
	import type { WheelSelection } from '@/types/tts.types';
	import { TtsPlaybackEngine } from './playbackEngine.svelte';
	import { useVoiceProfiles } from './useVoiceProfiles.svelte';
	import { formatTime } from './playbackMath';
	import TTSPlayerFull from './TTSPlayerFull.svelte';
	import TTSPlayerMini from './TTSPlayerMini.svelte';

	const config = getCurrentStyle();

	let { mode = $bindable<PlayerMode>('mini') }: { mode?: PlayerMode } = $props();

	const engine = new TtsPlaybackEngine();
	const voice = useVoiceProfiles();

	let showProfilePicker = $state(false);
	let pickerFilter = $state('');
	let showControls = $state(true);
	let hideControlsTimeout: ReturnType<typeof setTimeout> | null = null;

	const filteredProfiles = $derived(
		pickerFilter.trim() === ''
			? voice.profiles
			: voice.profiles.filter((p) =>
					p.name_prefix.toLowerCase().includes(pickerFilter.trim().toLowerCase())
				)
	);

	const wheelInitial = $derived<WheelSelection>({
		profileId: voice.selectedProfileId,
		audioFile: ttsState.config.refAudioFilename,
		randomChunk: ttsState.config.randomChunk,
		synthParams: {
			numStep: ttsState.config.numStep,
			guidanceScale: ttsState.config.guidanceScale,
			speed: ttsState.config.speed,
			splitLevel: ttsState.config.splitLevel
		},
		pauseSettings: { ...ttsState.pauseSettings }
	});

	const amplitudeScale = $derived(mode === 'mini' ? 1.7 : 0.5);
	const wavelengthScale = 300;

	const waveDrawConfig: WaveformDrawConfig = $derived({
		splineSampleStep: 0.4,
		amplitudeScale,
		maxWaveAmplitudePx: 120,
		wavelengthScale,
		sineFillAlpha: 0.24,
		strokeWidth: 8
	});

	const waveColor = `rgba(255, 255, 255, ${config.strokeAlpha})`;

	const remainingLabel = $derived(
		engine.totalPlaybackDuration > 0 && (ttsState.isPlaying || ttsState.isPaused)
			? formatTime(Math.max(0, Math.floor(engine.totalPlaybackDuration - engine.elapsedSeconds)))
			: null
	);

	const panelVisible = $derived(
		ttsState.isPlaying ||
			ttsState.isPaused ||
			ttsState.isGenerating ||
			ttsState.addVoiceLoading ||
			!!ttsState.errorMessage
	);

	function scheduleHideControls() {
		if (hideControlsTimeout !== null) {
			clearTimeout(hideControlsTimeout);
		}
		hideControlsTimeout = setTimeout(() => {
			showControls = false;
		}, 1000);
	}

	function clearHideControls() {
		if (hideControlsTimeout !== null) {
			clearTimeout(hideControlsTimeout);
			hideControlsTimeout = null;
		}
	}

	engine.onChunkStarted = scheduleHideControls;
	engine.onPause = () => {
		clearHideControls();
		showControls = true;
	};
	engine.onReset = () => {
		clearHideControls();
		showControls = true;
	};

	function handlePlayerMouseMove() {
		showControls = true;
		scheduleHideControls();
	}

	function handlePrimaryClick() {
		void engine.togglePlay();
	}

	function handleStop() {
		engine.stop();
	}

	function openProfilePicker() {
		if (mode !== 'mini' || showProfilePicker) return;
		pickerFilter = '';
		showProfilePicker = true;
	}

	function closeProfilePicker() {
		showProfilePicker = false;
	}

	function expandToFull() {
		showProfilePicker = false;
		mode = 'full';
	}

	function handlePickProfile(profile: VoiceProfile) {
		void voice.handleLiveVoiceChange({ ...wheelInitial, profileId: profile.id });
		showProfilePicker = false;
	}

	function handlePlayerClick() {
		if (mode === 'mini' && !showProfilePicker) {
			openProfilePicker();
		}
	}

	function handlePlayerKeydown(event: KeyboardEvent) {
		if (mode === 'mini' && !showProfilePicker && (event.key === 'Enter' || event.key === ' ')) {
			event.preventDefault();
			openProfilePicker();
		}
	}

	createHotkey(
		'Escape',
		() => {
			if (showProfilePicker) {
				closeProfilePicker();
			} else if (mode === 'full') {
				mode = 'mini';
			} else {
				handleStop();
			}
		},
		{
			stopPropagation: true,
			preventDefault: true
		}
	);

	createHotkey('Space', handlePrimaryClick, {
		stopPropagation: true,
		preventDefault: true,
		ignoreInputs: true
	});

	createHotkey('ArrowRight', () => engine.seekForward(), {
		stopPropagation: true,
		preventDefault: true,
		ignoreInputs: true
	});

	createHotkey('ArrowLeft', () => engine.seekBackward(), {
		stopPropagation: true,
		preventDefault: true,
		ignoreInputs: true
	});

	onMount(() => {
		void voice.initProfiles();
	});

	$effect(() => {
		if (
			ttsState.blobs.length > 0 &&
			ttsState.isPlaying &&
			engine.decodedChunks.length === 0 &&
			!engine.isSettingUp
		) {
			void engine.start();
		} else if (ttsState.blobs.length === 0 && !ttsState.isPaused) {
			engine.decodedChunks = [];
			engine.chunkOffsets = [];
		}
	});

	$effect(() => {
		const version = ttsState.chunkNotifyVersion;
		if (version > 0 && engine.waitingForChunk && ttsState.isPlaying && !engine.isSettingUp) {
			engine.onChunkAvailable();
		}
	});

	$effect(() => {
		const generating = ttsState.isGenerating;
		const blobCount = ttsState.blobs.length;
		const total = ttsState.totalChunks;

		if (generating && !ttsState.isPlaying && !ttsState.isPaused) {
			engine.totalPlaybackDuration = 0;
		} else if (blobCount > 0 && blobCount === total) {
			void engine.decodeAll(blobCount);
		}
	});

	let prevConfigSig = ttsState.configSig;

	$effect(() => {
		const currentSig = ttsState.configSig;
		const id = ttsState.generatedId;

		if (currentSig !== prevConfigSig) {
			prevConfigSig = currentSig;
			if (id) {
				engine.resetForConfigChange();
				void ttsState.forceRegenerate(id).catch((err) => {
					ttsState.errorMessage = err instanceof Error ? err.message : 'Failed to regenerate TTS';
					console.error('[TTS] Regeneration error:', err);
				});
			}
		}
	});

	$effect(() => {
		return () => {
			engine.stop();
		};
	});

	$effect(() => {
		const handleForeground = () => {
			if (!document.hidden && ttsState.isPaused) {
				resetAudioContext();
				engine.resetForForeground();
			}
		};

		window.addEventListener('focus', handleForeground);
		document.addEventListener('visibilitychange', handleForeground);

		return () => {
			window.removeEventListener('focus', handleForeground);
			document.removeEventListener('visibilitychange', handleForeground);
		};
	});
</script>

{#if panelVisible}
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<div
		class="tts-player"
		class:tts-player--mini={mode === 'mini'}
		class:tts-player--picking={mode === 'mini' && showProfilePicker}
		role={mode === 'mini' && !showProfilePicker ? 'button' : undefined}
		aria-label={mode === 'mini' && !showProfilePicker ? 'Select voice' : undefined}
		tabindex={mode === 'mini' && !showProfilePicker ? 0 : undefined}
		onmousemove={handlePlayerMouseMove}
		onclick={handlePlayerClick}
		onkeydown={handlePlayerKeydown}
	>
		{#if mode === 'full'}
			<TTSPlayerFull
				profiles={voice.profiles}
				chunks={voice.chunks}
				selection={wheelInitial}
				onVoiceChange={voice.handleLiveVoiceChange}
				analyser={engine.analyser}
				{waveColor}
				drawConfig={waveDrawConfig}
				waveConfig={config}
				waitingForChunk={engine.waitingForChunk}
				{showControls}
				{remainingLabel}
				onPrimary={handlePrimaryClick}
				onStop={handleStop}
				onSettings={() => void mainVoiceState.toggle()}
			/>
		{:else}
			<TTSPlayerMini
				{showProfilePicker}
				{filteredProfiles}
				selectedProfileId={voice.selectedProfileId}
				bind:filter={pickerFilter}
				onPickProfile={handlePickProfile}
				onExpand={expandToFull}
				analyser={engine.analyser}
				{waveColor}
				drawConfig={waveDrawConfig}
				waveConfig={config}
				waitingForChunk={engine.waitingForChunk}
			/>
		{/if}
	</div>
{/if}

<style>
	.tts-player {
		display: flex;
		flex-direction: column;
		align-items: center;
		position: fixed;
		inset: 0;
		overflow: hidden;
		background: rgba(14, 14, 14, 0.9);
		z-index: 1000;
		font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
	}

	.tts-player--mini {
		position: fixed;
		top: auto;
		right: auto;
		bottom: 1.5rem;
		left: 50%;
		transform: translateX(-50%);
		background: transparent !important;
		border: none;
		box-shadow: none;
		padding: 0;
		border-radius: 0;
		width: 300px;
		height: 70px;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 0;
		pointer-events: auto;
	}

	.tts-player--mini:focus-visible {
		outline: 2px solid var(--primary-color);
		outline-offset: 4px;
	}

	.tts-player--picking {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 0.5rem;
		left: 0;
		right: 0;
		width: 100%;
		transform: none;
		height: auto;
		padding: 0.75rem 1rem;
		background: rgba(9, 9, 9, 0.92) !important;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: var(--radius-lg);
		cursor: default;
	}
</style>
