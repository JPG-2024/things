<script lang="ts">
	import { onMount } from 'svelte';
	import { ttsState } from '@/stores/ttsStore.svelte';
	import { mainVoiceState } from '@/stores/mainVoice.svelte';
	import { viewState, voiceSettingsState } from '@/stores/viewStore.svelte';
	import { getCurrentStyle } from '@/lib/ttsPlayerConfig';
	import { resetAudioContext } from '@/lib/audioContextManager';
	import type { WaveformDrawConfig } from '@/lib/canvasWaveform';
	import { createHotkey } from '@tanstack/svelte-hotkeys';
	import type { SynthParams, PauseSettings } from '@/types/tts.types';
	import { TtsPlaybackEngine } from './playbackEngine.svelte';
	import { formatTime } from './playbackMath';
	import TTSPlayerMini from './TTSPlayerMini.svelte';
	import VoiceSettingsModal from '@/components/modals/VoiceSettingsModal.svelte';

	const config = getCurrentStyle();

	const engine = new TtsPlaybackEngine();

	let showControls = $state(false);
	let hideControlsTimeout: ReturnType<typeof setTimeout> | null = null;

	const ttsSynthParams = $derived<SynthParams>({
		numStep: ttsState.config.numStep,
		guidanceScale: ttsState.config.guidanceScale,
		speed: ttsState.config.speed,
		splitLevel: ttsState.config.splitLevel
	});

	const wheelInitial = $derived({
		profileId: ttsState.selectedProfileId,
		audioFile: ttsState.config.refAudioFilename,
		randomChunk: ttsState.config.randomChunk,
		synthParams: ttsSynthParams,
		pauseSettings: { ...ttsState.pauseSettings }
	});

	const waveDrawConfig: WaveformDrawConfig = {
		splineSampleStep: 0.2,
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

	/**
	 * Profile voice chunk used to synthesize the chunk currently reproduced.
	 * `-1` (default reference) resolves to the selected reference's position
	 * in the profile so non-random mode still shows a real number.
	 */
	const voiceChunkLabel = $derived.by(() => {
		if (!ttsState.isPlaying && !ttsState.isPaused) return null;
		const idx = ttsState.voiceChunkIndexAt(engine.currentChunkIndex);
		if (idx === null || ttsState.voiceChunks.length === 0) return null;
		const resolved =
			idx >= 0
				? idx
				: ttsState.voiceChunks.findIndex((c) => c.audio_file === ttsState.config.refAudioFilename);
		return resolved >= 0 ? `#${resolved + 1}/${ttsState.voiceChunks.length}` : null;
	});

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

	function openVoiceSettings() {
		voiceSettingsState.openTts();
	}

	function handlePlayerClick() {
		openVoiceSettings();
	}

	function handlePlayerKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			openVoiceSettings();
		}
	}

	function handleSelectProfile(profileId: string) {
		void ttsState.handleLiveVoiceWheelChange({ ...wheelInitial, profileId });
	}

	function applySynthSettings(value: {
		audioFile: string;
		randomChunk: boolean;
		synthParams: SynthParams;
		pauseSettings: PauseSettings;
		instruct?: string;
	}) {
		ttsState.config.randomChunk = value.randomChunk;
		ttsState.config.numStep = value.synthParams.numStep;
		ttsState.config.guidanceScale = value.synthParams.guidanceScale;
		ttsState.config.speed = value.synthParams.speed;
		ttsState.config.splitLevel = value.synthParams.splitLevel;

		if (value.instruct !== undefined) {
			// Voice design vs cloning is part of configSig, so a change here
			// triggers the full regeneration through the configSig effect.
			ttsState.config.instruct = value.instruct;
		}

		ttsState.pauseSettings.minGapMs = value.pauseSettings.minGapMs;
		ttsState.pauseSettings.maxGapMs = value.pauseSettings.maxGapMs;
		ttsState.pauseSettings.betweenParagraphs = value.pauseSettings.betweenParagraphs;

		if (value.audioFile && value.audioFile !== ttsState.config.refAudioFilename) {
			const picked = ttsState.voiceChunks.find((c) => c.audio_file === value.audioFile);
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
			handleStop();
		},
		() => ({
			enabled: !voiceSettingsState.ttsOpen,
			stopPropagation: true,
			preventDefault: true
		})
	);

	createHotkey('Space', handlePrimaryClick, {
		stopPropagation: true,
		preventDefault: true,
		ignoreInputs: true
	});

	// Arrows seek only while playback is active; idle, they stay free for the
	// dashboard tab switcher (the hotkey manager fires every matching handler).
	createHotkey(
		'ArrowRight',
		() => engine.seekForward(),
		() => ({
			stopPropagation: true,
			preventDefault: true,
			ignoreInputs: true,
			enabled: ttsState.isPlaying || ttsState.isPaused
		})
	);

	createHotkey(
		'ArrowLeft',
		() => engine.seekBackward(),
		() => ({
			stopPropagation: true,
			preventDefault: true,
			ignoreInputs: true,
			enabled: ttsState.isPlaying || ttsState.isPaused
		})
	);

	onMount(() => {
		void ttsState.initVoiceProfiles();
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
			engine.decodedDurations = [];
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

{#if panelVisible}
	<div
		class="tts-player tts-player--mini"
		role="button"
		aria-label="Voice settings"
		tabindex="0"
		onmousemove={handlePlayerMouseMove}
		onclick={handlePlayerClick}
		onkeydown={handlePlayerKeydown}
	>
		<TTSPlayerMini
			analyser={engine.analyser}
			{waveColor}
			drawConfig={waveDrawConfig}
			waveConfig={config}
			waitingForChunk={engine.waitingForChunk}
			{showControls}
			{remainingLabel}
			{voiceChunkLabel}
			onPrimary={handlePrimaryClick}
			onStop={handleStop}
		/>
	</div>
{/if}

<VoiceSettingsModal
	show={voiceSettingsState.ttsOpen}
	title="TTS synthesis settings"
	chunks={ttsState.voiceChunks}
	audioFile={ttsState.config.refAudioFilename}
	randomChunk={ttsState.config.randomChunk}
	synthParams={ttsSynthParams}
	pauseSettings={ttsState.pauseSettings}
	management={true}
	profiles={ttsState.voiceProfiles}
	selectedProfileId={ttsState.selectedProfileId}
	onSelectProfile={handleSelectProfile}
	instruct={ttsState.config.instruct ?? ''}
	showVoiceDesign={true}
	onAddVoice={() => mainVoiceState.runAddVoice()}
	onSaveProfile={(id, name, image) => mainVoiceState.saveProfile(id, name, image)}
	onDeleteProfile={(id) => mainVoiceState.deleteProfile(id)}
	onSaveRecording={(blob, opts) => mainVoiceState.saveRecording(blob, opts)}
	onProfilesChanged={() => void ttsState.initVoiceProfiles(true)}
	onChange={applySynthSettings}
	onClose={() => voiceSettingsState.closeTts()}
	onChunksChanged={() => void ttsState.loadVoiceChunksForProfile(ttsState.selectedProfileId)}
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
		/* Shares the floating player's corner geometry so the strip sits
		 * centered on top of the minimized YouTube thumbnail (see the
		 * --float-* vars in +layout.svelte). Without a video it simply rests
		 * on the same transparent spot. */
		left: auto;
		right: var(--float-anchor-right);
		bottom: calc(var(--float-anchor-bottom) + (var(--float-mini-height) - 70px) / 2);
		transform: none;
		background: transparent !important;
		border: none;
		box-shadow: none;
		padding: 0;
		border-radius: 0;
		width: var(--float-mini-width);
		height: 70px;
		/* The error toast renders above the strip; the base .tts-player rule
		 * clips it otherwise. */
		overflow: visible;
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
</style>
