<script lang="ts">
	import { onMount } from 'svelte';
	import { ttsState } from '@/stores/ttsStore.svelte';
	import { mainVoiceState } from '@/stores/mainVoice.svelte';
	import { viewState, voiceSettingsState } from '@/stores/viewStore.svelte';
	import { getCurrentStyle } from '@/lib/ttsPlayerConfig';
	import { resetAudioContext } from '@/lib/audioContextManager';
	import type { WaveformDrawConfig } from '@/lib/canvasWaveform';
	import { createHotkey } from '@tanstack/svelte-hotkeys';
	import type { VoiceProfile } from '@/lib/utils/ttsService';
	import type { SynthParams, PauseSettings } from '@/types/tts.types';
	import { TtsPlaybackEngine } from './playbackEngine.svelte';
	import { useVoiceProfiles } from './useVoiceProfiles.svelte';
	import { formatTime } from './playbackMath';
	import TTSPlayerMini from './TTSPlayerMini.svelte';
	import MiniProfilePicker from './MiniProfilePicker.svelte';
	import VoiceSettingsModal from '@/components/modals/VoiceSettingsModal.svelte';

	const config = getCurrentStyle();

	const engine = new TtsPlaybackEngine();
	const voice = useVoiceProfiles();

	let showProfilePicker = $state(false);
	let pickerFilter = $state('');
	let showControls = $state(false);
	let hideControlsTimeout: ReturnType<typeof setTimeout> | null = null;

	const ttsSynthParams = $derived<SynthParams>({
		numStep: ttsState.config.numStep,
		guidanceScale: ttsState.config.guidanceScale,
		speed: ttsState.config.speed,
		splitLevel: ttsState.config.splitLevel
	});

	const wheelInitial = $derived({
		profileId: voice.selectedProfileId,
		audioFile: ttsState.config.refAudioFilename,
		randomChunk: ttsState.config.randomChunk,
		synthParams: ttsSynthParams,
		pauseSettings: { ...ttsState.pauseSettings }
	});

	const waveDrawConfig: WaveformDrawConfig = {
		splineSampleStep: 0.4,
		amplitudeScale: 1.7,
		maxWaveAmplitudePx: 120,
		wavelengthScale: 300,
		sineFillAlpha: 0.24,
		strokeWidth: 8
	};

	const waveColor = $derived.by(() => {
		const alpha = config.strokeAlpha;
		if (alpha >= 1) return viewState.backgroundColor;
		const match = viewState.backgroundColor.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
		if (!match) return viewState.backgroundColor;
		return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha})`;
	});

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
		if (showProfilePicker) return;
		pickerFilter = '';
		showProfilePicker = true;
	}

	function closeProfilePicker() {
		showProfilePicker = false;
	}

	function handlePickProfile(profile: VoiceProfile) {
		void voice.handleLiveVoiceChange({ ...wheelInitial, profileId: profile.id });
		showProfilePicker = false;
	}

	function handlePlayerClick() {
		if (!showProfilePicker) {
			openProfilePicker();
		}
	}

	function handlePlayerKeydown(event: KeyboardEvent) {
		if (!showProfilePicker && (event.key === 'Enter' || event.key === ' ')) {
			event.preventDefault();
			openProfilePicker();
		}
	}

	function applySynthSettings(value: {
		audioFile: string;
		randomChunk: boolean;
		synthParams: SynthParams;
		pauseSettings: PauseSettings;
	}) {
		ttsState.config.randomChunk = value.randomChunk;
		ttsState.config.numStep = value.synthParams.numStep;
		ttsState.config.guidanceScale = value.synthParams.guidanceScale;
		ttsState.config.speed = value.synthParams.speed;
		ttsState.config.splitLevel = value.synthParams.splitLevel;

		ttsState.pauseSettings.minGapMs = value.pauseSettings.minGapMs;
		ttsState.pauseSettings.maxGapMs = value.pauseSettings.maxGapMs;
		ttsState.pauseSettings.betweenParagraphs = value.pauseSettings.betweenParagraphs;

		if (value.audioFile && value.audioFile !== ttsState.config.refAudioFilename) {
			const picked = voice.chunks.find((c) => c.audio_file === value.audioFile);
			if (picked) {
				ttsState.config.refAudioFilename = picked.audio_file;
				ttsState.config.refText = picked.text_reference;
			}
		}

		// A reference-only change should revoice upcoming chunks, not rebuild the
		// playlist. Actual synth-param changes still trigger a full regeneration
		// through the configSig effect.
		ttsState.applyVoiceSelectionToPending(value.randomChunk, value.audioFile);
	}

	createHotkey(
		'Escape',
		() => {
			if (showProfilePicker) {
				closeProfilePicker();
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
		void mainVoiceState.ensureProfiles();
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

{#snippet profilePicker()}
	<MiniProfilePicker
		bind:filter={pickerFilter}
		profiles={voice.profiles}
		selectedProfileId={voice.selectedProfileId}
		onPick={handlePickProfile}
		management={true}
		onSettings={() => {
			showProfilePicker = false;
			voiceSettingsState.openTts();
		}}
		onAddVoice={() => mainVoiceState.runAddVoice()}
		onSaveProfile={(id, name, image) => mainVoiceState.saveProfile(id, name, image)}
		onDeleteProfile={(id) => mainVoiceState.deleteProfile(id)}
		onSaveRecording={(blob, opts) => mainVoiceState.saveRecording(blob, opts)}
		onProfilesChanged={() => voice.initProfiles()}
	/>
{/snippet}

{#if panelVisible}
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<div
		class="tts-player tts-player--mini"
		class:tts-player--picking={showProfilePicker}
		role={!showProfilePicker ? 'button' : undefined}
		aria-label={!showProfilePicker ? 'Select voice' : undefined}
		tabindex={!showProfilePicker ? 0 : undefined}
		onmousemove={handlePlayerMouseMove}
		onclick={handlePlayerClick}
		onkeydown={handlePlayerKeydown}
	>
		{#if showProfilePicker}
			{@render profilePicker()}
		{:else}
			<TTSPlayerMini
				analyser={engine.analyser}
				{waveColor}
				drawConfig={waveDrawConfig}
				waveConfig={config}
				waitingForChunk={engine.waitingForChunk}
				{showControls}
				{remainingLabel}
				onPrimary={handlePrimaryClick}
				onStop={handleStop}
			/>
		{/if}
	</div>
{/if}

<VoiceSettingsModal
	show={voiceSettingsState.ttsOpen}
	title="TTS synthesis settings"
	chunks={voice.chunks}
	audioFile={ttsState.config.refAudioFilename}
	randomChunk={ttsState.config.randomChunk}
	synthParams={ttsSynthParams}
	pauseSettings={ttsState.pauseSettings}
	onChange={applySynthSettings}
	onClose={() => voiceSettingsState.closeTts()}
	onChunksChanged={() => void voice.loadChunksForProfile(voice.selectedProfileId)}
/>

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
