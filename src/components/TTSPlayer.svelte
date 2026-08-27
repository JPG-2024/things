<script lang="ts">
	import { onMount } from 'svelte';
	import { ttsState } from '@/stores/ttsStore.svelte';
	import { fade, fly } from 'svelte/transition';
	import Icon from '@/components/Icon.svelte';
	import VoiceSelector from '@/components/VoiceSelector.svelte';
	import type { WheelSelection } from '@/components/modals/VoiceProfileWheel.svelte';
	import {
		fetchVoiceProfiles,
		fetchVoiceChunks,
		type Voice,
		type VoiceProfile
	} from '@/lib/utils/ttsService';
	import { createHotkey } from '@tanstack/svelte-hotkeys';
	import { getCurrentStyle, type PlayerMode } from '@/lib/ttsPlayerConfig';
	import {
		getAudioContext,
		ensureAudioContext,
		resetAudioContext,
		closeAudioContext
	} from '@/lib/audioContextManager';
	import {
		createAnalyserNode,
		teardownSource,
		teardownAnalyser,
		decodeBlob,
		waitMs
	} from '@/lib/audioNodeHelpers';
	import {
		drawWaveform as drawWaveformShared,
		drawGeneratingWave as drawGeneratingWaveShared,
		drawIdleLine as drawIdleLineShared,
		clearCanvas,
		type WaveformDrawConfig
	} from '@/lib/canvasWaveform';
	import { viewState, drawersState } from '@/stores/viewStore.svelte';

	const config = getCurrentStyle();

	let { mode = $bindable<PlayerMode>('mini') }: { mode?: PlayerMode } = $props();
	let canvas: HTMLCanvasElement | null = $state(null);
	let currentSource: AudioBufferSourceNode | null = $state(null);
	let analyserNode: AnalyserNode | null = $state(null);
	let isSettingUp = false;
	let playbackStartTime = 0;
	let countdownInterval: ReturnType<typeof setInterval> | null = null;

	let pausedAt = 0;
	let decodedChunks: (AudioBuffer | null)[] = [];
	let currentChunkIndex = 0;
	let chunkOffsets: number[] = [];
	let waitingForChunk = $state(false);

	let animationFrame: number | null = null;

	let profiles = $state<VoiceProfile[]>([]);
	let chunks = $state<Voice[]>([]);
	let selectedProfileId = $state('');

	const wheelInitial = $derived<WheelSelection>({
		profileId: selectedProfileId,
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

	const amplitudeScale = $derived(mode === 'mini' ? 1.5 : 0.2);
	const wavelengthScale = 300;

	const waveDrawConfig: WaveformDrawConfig = $derived({
		splineSampleStep: 0.1,
		amplitudeScale,
		maxWaveAmplitudePx: 80,
		wavelengthScale,
		sineFillAlpha: 0.24,
		strokeWidth: 4
	});

	function waveColor(): string {
		return viewState.primaryColorAlpha(config.strokeAlpha);
	}

	let showControls = $state(true);
	let hideControlsTimeout: ReturnType<typeof setTimeout> | null = null;

	const SEEK_SECONDS = 5;
	const PREBUFFER_RATIO = 0.3;
	const MIN_PREBUFFER = 1.5;
	let elapsedSeconds = $state(0);
	let totalPlaybackDuration = $state(0);
	let nextChunkPrefetchRequested = false;
	let currentChunkDuration = 0;
	let gapAbort: AbortController | null = null;

	function setTtsError(err: unknown, fallback: string) {
		ttsState.errorMessage = err instanceof Error ? err.message : fallback;
		console.error('[TTS]', err);
	}

	function cancelGap() {
		if (gapAbort) {
			gapAbort.abort();
			gapAbort = null;
		}
	}

	function recomputeChunkOffsets() {
		chunkOffsets = [];
		let cumulative = 0;
		const count = decodedChunks.length;
		for (let i = 0; i < count; i++) {
			chunkOffsets.push(cumulative);
			cumulative += decodedChunks[i]?.duration ?? 0;
			if (i < count - 1) {
				cumulative += ttsState.pauseAfter(i);
			}
		}
	}

	function computeTotalDuration(): number {
		let total = 0;
		const count = decodedChunks.length;
		for (let i = 0; i < count; i++) {
			total += decodedChunks[i]?.duration ?? 0;
			if (i < count - 1) {
				total += ttsState.pauseAfter(i);
			}
		}
		return total;
	}

	function findChunkAtTime(globalTime: number): { chunkIndex: number; offsetInChunk: number } {
		recomputeChunkOffsets();
		for (let i = decodedChunks.length - 1; i >= 0; i--) {
			if (chunkOffsets[i] <= globalTime) {
				return { chunkIndex: i, offsetInChunk: globalTime - chunkOffsets[i] };
			}
		}
		return { chunkIndex: 0, offsetInChunk: 0 };
	}

	async function ensureDecodedChunk(index: number): Promise<AudioBuffer | null> {
		if (index < 0 || index >= ttsState.blobs.length) return null;
		if (decodedChunks[index]) return decodedChunks[index];
		const ctx = getAudioContext();
		const buf = await decodeBlob(ttsState.blobs[index], ctx);
		decodedChunks[index] = buf;
		recomputeChunkOffsets();
		return buf;
	}

	async function playChunkAt(index: number, offsetInChunk = 0) {
		if (isSettingUp) return;
		isSettingUp = true;

		try {
			const buf = await ensureDecodedChunk(index);
			if (!buf) {
				stopPlayback();
				return;
			}

			if (currentSource) {
				teardownSource(currentSource);
				currentSource = null;
			}

			teardownAnalyser(analyserNode);
			analyserNode = null;

			const ctx = getAudioContext();
			const source = ctx.createBufferSource();
			source.buffer = buf;

			const analyser = createAnalyserNode(ctx);

			source.connect(analyser);
			analyser.connect(ctx.destination);

			source.onended = () => {
				handleChunkEnded();
			};

			source.start(0, offsetInChunk);
			currentSource = source;
			analyserNode = analyser;
			currentChunkIndex = index;
			currentChunkDuration = buf.duration;
			nextChunkPrefetchRequested = false;

			recomputeChunkOffsets();
			totalPlaybackDuration = computeTotalDuration();
			const globalStart = chunkOffsets[index] + offsetInChunk;
			playbackStartTime = performance.now() - globalStart * 1000;
			ttsState.isPlaying = true;
			ttsState.isPaused = false;
			waitingForChunk = false;
			startCountdown();
			scheduleHideControls();
		} catch (err) {
			setTtsError(err, 'Failed to play audio');
			stopPlayback();
		} finally {
			isSettingUp = false;
		}
	}

	function handleChunkEnded() {
		teardownSource(currentSource);
		currentSource = null;
		teardownAnalyser(analyserNode);
		analyserNode = null;

		const nextIdx = currentChunkIndex + 1;
		if (nextIdx < ttsState.blobs.length) {
			if (decodedChunks[nextIdx] || ttsState.blobs[nextIdx]) {
				const delay = ttsState.pauseAfter(currentChunkIndex) * 1000;
				if (delay > 0) {
					gapAbort = new AbortController();
					void waitMs(delay, gapAbort.signal).then(() => {
						gapAbort = null;
						void playChunkAt(nextIdx);
					});
				} else {
					void playChunkAt(nextIdx);
				}
			} else {
				waitingForChunk = true;
			}
		} else if (nextIdx < ttsState.totalChunks) {
			waitingForChunk = true;
			if (!nextChunkPrefetchRequested) {
				void ttsState.generateNextChunk();
			}
		} else {
			stopPlayback();
		}
	}

	async function startPlayback() {
		if (isSettingUp || ttsState.blobs.length === 0) return;
		decodedChunks = new Array(ttsState.blobs.length).fill(null);
		chunkOffsets = [];
		currentChunkIndex = 0;
		try {
			await ensureAudioContext();
			await playChunkAt(0);
		} catch (err) {
			setTtsError(err, 'Failed to start playback');
			stopPlayback();
		}
	}

	function pausePlayback() {
		if (!currentSource || !ttsState.isPlaying) return;
		pausedAt = (performance.now() - playbackStartTime) / 1000;
		ttsState.isPaused = true;
		ttsState.isPlaying = false;
		clearCountdown();
		cancelGap();
		if (hideControlsTimeout !== null) {
			clearTimeout(hideControlsTimeout);
			hideControlsTimeout = null;
		}
		showControls = true;
		teardownSource(currentSource);
		currentSource = null;
		teardownAnalyser(analyserNode);
		analyserNode = null;
	}

	async function resumePlayback() {
		if (isSettingUp || !ttsState.isPaused) return;
		const { chunkIndex, offsetInChunk } = findChunkAtTime(pausedAt);
		try {
			await ensureDecodedChunk(chunkIndex);
			await playChunkAt(chunkIndex, offsetInChunk);
		} catch (err) {
			setTtsError(err, 'Failed to resume playback');
			stopPlayback();
		}
	}

	function cleanupPlayback() {
		teardownSource(currentSource);
		currentSource = null;
		teardownAnalyser(analyserNode);
		analyserNode = null;
		clearCountdown();
		cancelGap();
		if (hideControlsTimeout !== null) {
			clearTimeout(hideControlsTimeout);
			hideControlsTimeout = null;
		}
		showControls = true;

		ttsState.isPaused = false;
		pausedAt = 0;
		elapsedSeconds = 0;
		totalPlaybackDuration = 0;
		decodedChunks = [];
		chunkOffsets = [];
		currentChunkIndex = 0;
		waitingForChunk = false;
		nextChunkPrefetchRequested = false;
		ttsState.errorMessage = '';
	}

	function stopPlayback() {
		cleanupPlayback();
		ttsState.fullReset();
		closeAudioContext();
		clearLocalCanvas();
	}

	function startCountdown() {
		clearCountdown();
		countdownInterval = setInterval(() => {
			const elapsed = (performance.now() - playbackStartTime) / 1000;
			elapsedSeconds = elapsed;

			if (
				!nextChunkPrefetchRequested &&
				currentChunkIndex + 1 < ttsState.totalChunks &&
				currentChunkIndex + 1 >= ttsState.blobs.length
			) {
				const chunkEndTime =
					playbackStartTime + (chunkOffsets[currentChunkIndex] + currentChunkDuration) * 1000;
				const timeRemaining = (chunkEndTime - performance.now()) / 1000;

				const estimatedGenTime = ttsState.averageGenerationTime;
				const prebufferSeconds = Math.max(
					MIN_PREBUFFER,
					currentChunkDuration * PREBUFFER_RATIO,
					estimatedGenTime * 1.2
				);

				if (timeRemaining <= prebufferSeconds) {
					nextChunkPrefetchRequested = true;
					void ttsState.generateNextChunk();
				}
			}
		}, 500);
	}

	function clearCountdown() {
		if (countdownInterval !== null) {
			clearInterval(countdownInterval);
			countdownInterval = null;
		}
	}

	function scheduleHideControls() {
		if (hideControlsTimeout !== null) {
			clearTimeout(hideControlsTimeout);
		}
		hideControlsTimeout = setTimeout(() => {
			showControls = false;
		}, 1000);
	}

	async function loadChunksForProfile(profileId: string) {
		try {
			chunks = await fetchVoiceChunks(profileId);
			ttsState.setVoiceChunks(chunks);
		} catch (err) {
			ttsState.errorMessage = err instanceof Error ? err.message : 'Failed to load voice chunks';
		}
	}

	async function handleVoiceChange(sel: WheelSelection) {
		const profile = profiles.find((p) => p.id === sel.profileId);
		if (profile) {
			selectedProfileId = profile.id;
			ttsState.namePrefix = profile.name_prefix;
			await loadChunksForProfile(profile.id);
			const firstChunk = chunks[0];
			if (firstChunk) {
				ttsState.config.refAudioFilename = firstChunk.audio_file;
				ttsState.config.refText = firstChunk.text_reference;
			}
		}

		ttsState.config.randomChunk = sel.randomChunk;
		ttsState.config.numStep = sel.synthParams.numStep;
		ttsState.config.guidanceScale = sel.synthParams.guidanceScale;
		ttsState.config.speed = sel.synthParams.speed;
		ttsState.config.splitLevel = sel.synthParams.splitLevel;

		ttsState.pauseSettings.minGapMs = sel.pauseSettings.minGapMs;
		ttsState.pauseSettings.maxGapMs = sel.pauseSettings.maxGapMs;
		ttsState.pauseSettings.betweenParagraphs = sel.pauseSettings.betweenParagraphs;

		if (sel.audioFile && sel.audioFile !== chunks[0]?.audio_file) {
			const picked = chunks.find((c) => c.audio_file === sel.audioFile);
			if (picked) {
				ttsState.config.refAudioFilename = picked.audio_file;
				ttsState.config.refText = picked.text_reference;
			}
		}
	}

	function handleLiveVoiceChange(sel: WheelSelection) {
		const isActive = ttsState.isGenerating || ttsState.isPlaying;
		if (!isActive) {
			void handleVoiceChange(sel);
			return;
		}

		const profile = profiles.find((p) => p.id === sel.profileId);
		if (profile && profile.id !== selectedProfileId) {
			selectedProfileId = profile.id;
			ttsState.namePrefix = profile.name_prefix;
			void loadChunksForProfile(profile.id).then(() => {
				const idx = sel.randomChunk
					? Math.floor(Math.random() * ttsState.voiceChunks.length)
					: sel.audioFile
						? ttsState.voiceChunks.findIndex((c) => c.audio_file === sel.audioFile)
						: 0;
				ttsState.updatePendingVoiceRefs(idx >= 0 ? idx : 0);
			});
			return;
		}

		const idx = sel.randomChunk
			? Math.floor(Math.random() * ttsState.voiceChunks.length)
			: sel.audioFile
				? chunks.findIndex((c) => c.audio_file === sel.audioFile)
				: 0;
		ttsState.updatePendingVoiceRefs(idx >= 0 ? idx : 0);
	}

	onMount(async () => {
		try {
			profiles = await fetchVoiceProfiles();
			const match = profiles.find((p) => p.name_prefix === ttsState.namePrefix);
			if (match) {
				selectedProfileId = match.id;
				await loadChunksForProfile(match.id);
			}
		} catch (err) {
			ttsState.errorMessage = err instanceof Error ? err.message : 'Failed to load voices';
		}
	});

	function handlePlayerMouseMove() {
		showControls = true;
		scheduleHideControls();
	}

	function getCurrentPosition(): number {
		if (ttsState.isPaused) return pausedAt;
		if (ttsState.isPlaying) return (performance.now() - playbackStartTime) / 1000;
		return 0;
	}

	async function seekTo(offset: number) {
		const duration = totalPlaybackDuration || 0;
		const clamped = Math.max(0, Math.min(offset, duration));

		if (ttsState.isPlaying) {
			const { chunkIndex, offsetInChunk } = findChunkAtTime(clamped);
			try {
				await ensureDecodedChunk(chunkIndex);
				if (currentSource) {
					teardownSource(currentSource);
					currentSource = null;
					teardownAnalyser(analyserNode);
					analyserNode = null;
				}
				await playChunkAt(chunkIndex, offsetInChunk);
			} catch (err) {
				setTtsError(err, 'Failed to seek');
				stopPlayback();
			}
		} else if (ttsState.isPaused) {
			pausedAt = clamped;
			elapsedSeconds = clamped;
		}
	}

	function handleSeekForward() {
		if (!ttsState.isPlaying && !ttsState.isPaused) return;
		void seekTo(getCurrentPosition() + SEEK_SECONDS);
	}

	function handleSeekBackward() {
		if (!ttsState.isPlaying && !ttsState.isPaused) return;
		void seekTo(getCurrentPosition() - SEEK_SECONDS);
	}

	function formatTime(seconds: number): string {
		const m = Math.floor(seconds / 60);
		const s = seconds % 60;
		return `${m}:${s.toString().padStart(2, '0')}`;
	}

	async function startFresh() {
		if (ttsState.blobs.length === 0) return;
		await startPlayback();
	}

	async function handlePrimaryClick() {
		if (ttsState.isPlaying) {
			pausePlayback();
		} else if (ttsState.isPaused) {
			await resumePlayback();
		} else {
			if (ttsState.isGenerating) return;
			try {
				await startFresh();
			} catch (err) {
				setTtsError(err, 'Failed to start playback');
				stopPlayback();
			}
		}
	}

	function handleStop() {
		stopPlayback();
	}

	function handlePlayerClick() {
		if (mode === 'mini') {
			mode = 'full';
		}
	}

	function handlePlayerKeydown(event: KeyboardEvent) {
		if (mode === 'mini' && (event.key === 'Enter' || event.key === ' ')) {
			event.preventDefault();
			mode = 'full';
		}
	}

	createHotkey(
		'Escape',
		() => {
			if (mode === 'full') {
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
		preventDefault: true
	});

	createHotkey('ArrowRight', handleSeekForward, {
		stopPropagation: true,
		preventDefault: true
	});

	createHotkey('ArrowLeft', handleSeekBackward, {
		stopPropagation: true,
		preventDefault: true
	});

	function drawLocalWaveform() {
		if (!canvas || !analyserNode) return;
		drawWaveformShared(canvas, analyserNode, waveColor(), waveDrawConfig);
	}

	function drawLocalGeneratingWave() {
		if (!canvas) return;
		drawGeneratingWaveShared(canvas, waveColor(), config, waveDrawConfig);
	}

	function drawLocalIdleLine() {
		if (!canvas) return;
		drawIdleLineShared(canvas, waveColor(), waveDrawConfig);
	}

	function clearLocalCanvas() {
		if (!canvas) return;
		clearCanvas(canvas);
	}

	function startAnimation() {
		if (animationFrame !== null) return;

		const step = () => {
			if (analyserNode && ttsState.isPlaying && !ttsState.isPaused) {
				drawLocalWaveform();
			} else if (
				ttsState.addVoiceLoading ||
				(ttsState.isGenerating && ttsState.chunksGenerated === 0)
			) {
				drawLocalGeneratingWave();
			} else if (ttsState.isGenerating || waitingForChunk) {
				drawLocalIdleLine();
			}
			animationFrame = requestAnimationFrame(step);
		};

		animationFrame = requestAnimationFrame(step);
	}

	function stopAnimation() {
		if (animationFrame !== null) {
			cancelAnimationFrame(animationFrame);
			animationFrame = null;
		}
	}

	$effect(() => {
		mode;
		const shouldAnimate =
			ttsState.isGenerating ||
			ttsState.addVoiceLoading ||
			waitingForChunk ||
			(analyserNode && ttsState.isPlaying && !ttsState.isPaused);
		if (shouldAnimate) {
			startAnimation();
		} else {
			stopAnimation();
		}

		return () => stopAnimation();
	});

	$effect(() => {
		if (
			ttsState.blobs.length > 0 &&
			ttsState.isPlaying &&
			decodedChunks.length === 0 &&
			!isSettingUp
		) {
			void startFresh();
		} else if (ttsState.blobs.length === 0 && !ttsState.isPaused) {
			decodedChunks = [];
			chunkOffsets = [];
		}
	});

	$effect(() => {
		const version = ttsState.chunkNotifyVersion;
		if (version > 0 && waitingForChunk && ttsState.isPlaying && !isSettingUp) {
			waitingForChunk = false;
			void playChunkAt(currentChunkIndex + 1);
		}
	});

	$effect(() => {
		const generating = ttsState.isGenerating;
		const blobCount = ttsState.blobs.length;
		const total = ttsState.totalChunks;

		if (generating && !ttsState.isPlaying && !ttsState.isPaused) {
			totalPlaybackDuration = 0;
		} else if (blobCount > 0 && blobCount === total) {
			const ctx = getAudioContext();
			const decodeAll = async () => {
				while (decodedChunks.length < blobCount) {
					decodedChunks.push(null);
				}
				try {
					await Promise.all(
						ttsState.blobs.map(async (blob, i) => {
							if (!decodedChunks[i]) {
								decodedChunks[i] = await decodeBlob(blob, ctx);
							}
						})
					);
					recomputeChunkOffsets();
					totalPlaybackDuration = computeTotalDuration();
				} catch (err) {
					setTtsError(err, 'Failed to decode audio');
				}
			};
			void decodeAll();
		}
	});

	let prevConfigSig = ttsState.configSig;

	$effect(() => {
		const currentSig = ttsState.configSig;
		const id = ttsState.generatedId;

		if (currentSig !== prevConfigSig) {
			prevConfigSig = currentSig;
			if (id) {
				cleanupPlayback();
				ttsState.isPlaying = false;
				ttsState.isPaused = false;
				closeAudioContext();
				void ttsState.forceRegenerate(id).catch((err) => {
					ttsState.errorMessage = err instanceof Error ? err.message : 'Failed to regenerate TTS';
					console.error('[TTS] Regeneration error:', err);
				});
			}
		}
	});

	$effect(() => {
		return () => {
			stopPlayback();
		};
	});

	$effect(() => {
		const handleForeground = () => {
			if (!document.hidden && ttsState.isPaused) {
				resetAudioContext();
				decodedChunks = [];
				chunkOffsets = [];
			}
		};

		window.addEventListener('focus', handleForeground);
		document.addEventListener('visibilitychange', handleForeground);

		return () => {
			window.removeEventListener('focus', handleForeground);
			document.removeEventListener('visibilitychange', handleForeground);
		};
	});

	const panelVisible = $derived(
		ttsState.isPlaying ||
			ttsState.isPaused ||
			ttsState.isGenerating ||
			ttsState.addVoiceLoading ||
			!!ttsState.errorMessage
	);
</script>

{#if panelVisible}
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<div
		class="tts-player"
		class:tts-player--mini={mode === 'mini'}
		role={mode === 'mini' ? 'button' : undefined}
		aria-label={mode === 'mini' ? 'Expand player' : undefined}
		tabindex={mode === 'mini' ? 0 : undefined}
		onmousemove={handlePlayerMouseMove}
		onclick={handlePlayerClick}
		onkeydown={handlePlayerKeydown}
	>
		{#if mode === 'full'}
			<div class="tts-player__header">
				<VoiceSelector
					{profiles}
					{chunks}
					selection={wheelInitial}
					onChange={handleLiveVoiceChange}
					isActive={ttsState.isPlaying}
					activeColor={viewState.primaryColor}
				/>
			</div>

			<div class="tts-player__canvas-container">
				<canvas bind:this={canvas} class="tts-player__canvas" aria-hidden="true"></canvas>
			</div>

			{#if (ttsState.isPlaying || ttsState.isPaused) && showControls}
				<div class="tts-player__controls" transition:fade={{ duration: 200 }}>
					<button
						type="button"
						class="tts-player__btn"
						onclick={handlePrimaryClick}
						aria-label={ttsState.isPlaying ? 'Pause' : 'Play'}
					>
						{#if ttsState.isPlaying}
							<Icon name="Pause" size={30} color={viewState.primaryColor} />
						{:else}
							<Icon name="Play" size={30} color={viewState.primaryColor} />
						{/if}
					</button>

					<button
						type="button"
						class="tts-player__btn tts-player__btn--stop"
						onclick={handleStop}
						aria-label="Stop"
					>
						<Icon name="Square" size={30} color={viewState.primaryColor} />
					</button>

					<button
						type="button"
						class="tts-player__btn tts-player__btn--settings"
						onclick={() => drawersState.toggle('tts-settings')}
						aria-label="TTS Settings"
					>
						<Icon name="SlidersHorizontal" size={30} color={viewState.primaryColor} />
					</button>
					{#if totalPlaybackDuration > 0 && (ttsState.isPlaying || ttsState.isPaused)}
						<span class="tts-player__time"
							>{formatTime(Math.max(0, Math.floor(totalPlaybackDuration - elapsedSeconds)))}</span
						>
					{/if}
				</div>
			{/if}

			{#if ttsState.addVoiceLoading && ttsState.addVoiceStatus}
				<div class="tts-player__status-overlay">
					<span>{ttsState.addVoiceMessage || ttsState.addVoiceStatus}</span>
				</div>
			{/if}
			{#if ttsState.errorMessage}
				<div class="tts-player__error">
					<span>{ttsState.errorMessage}</span>
					<button type="button" onclick={() => (ttsState.errorMessage = '')}>×</button>
				</div>
			{/if}
		{:else}
			<div class="tts-player-mini__content" transition:fly={{ duration: 200, y: -200 }}>
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="tts-player-mini__voice"
					onclick={(e) => e.stopPropagation()}
					onkeydown={(e) => e.stopPropagation()}
				>
					<VoiceSelector
						{profiles}
						{chunks}
						selection={wheelInitial}
						onChange={handleLiveVoiceChange}
						isActive={ttsState.isPlaying}
						activeColor={viewState.primaryColor}
					/>
				</div>
				<div class="tts-player-mini__canvas-clip">
					<canvas bind:this={canvas} class="tts-player-mini__canvas" aria-hidden="true"></canvas>
				</div>
			</div>

			{#if ttsState.errorMessage}
				<div class="tts-player-mini__error">
					<span>{ttsState.errorMessage}</span>
					<button type="button" onclick={() => (ttsState.errorMessage = '')}>×</button>
				</div>
			{/if}
		{/if}
	</div>
{/if}

<style>
	.tts-player {
		display: flex;
		flex-direction: column;
		align-items: center;
		/* border: 4px solid var(--pri mary-color); */
		position: fixed;
		inset: 0;
		overflow: hidden;
		background: rgba(14, 14, 14, 0.9);
		z-index: 1000;
		font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
	}

	.tts-player__canvas-container {
		width: 100%;
		height: 20%;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.tts-player__header {
		height: 35%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: flex-end;
		gap: 0.75rem;
	}

	.tts-player__picture-container {
		width: 250px;
		height: 150px;
		border-radius: var(--radius-lg);
		overflow: hidden;
		position: relative;
		display: block;
	}

	.tts-player__picture-container img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		left: 0;
		right: auto;
		filter: grayscale(100%) contrast(1.15);
		transform: scale(1.15);
	}

	.tts-player__picture-container::after {
		content: '';
		position: absolute;
		inset: 0;
		background: var(--primary-color);
		mix-blend-mode: color;
		pointer-events: none;
	}

	.tts-player__canvas {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		display: block;
	}

	.tts-player__controls {
		position: absolute;
		top: 64%;
		left: 50%;
		transform: translate(-50%, -50%);
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.tts-player__btn {
		all: unset;
		box-sizing: border-box;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		width: 50px;
		height: 50px;
		border-radius: 50%;
		color: var(--primary-color);
	}

	.tts-player__btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.tts-player__btn--stop {
		width: 40px;
		height: 40px;
	}

	.tts-player__btn--settings {
		width: 40px;
		height: 40px;
	}

	.tts-player__status-overlay {
		position: absolute;
		bottom: 2rem;
		left: 50%;
		transform: translateX(-50%);
		background: rgba(0, 0, 0, 0.8);
		color: var(--primary-color);
		font-size: 0.9rem;
		padding: 0.5rem 1rem;
		border-radius: var(--radius-md);
		z-index: 5;
	}

	.tts-player__time {
		color: var(--primary-color);
		opacity: 0.8;
		font-size: 1.2rem;
		font-weight: bold;
		font-variant-numeric: tabular-nums;
		padding: 0.25rem 0.5rem;
		border-radius: var(--radius-sm);
	}

	.tts-player__error {
		position: absolute;
		top: 1rem;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 1rem;
		background: rgba(255, 80, 80, 0.15);
		border: 1px solid rgba(255, 80, 80, 0.4);
		border-radius: var(--radius-md);
		color: #ff5a5a;
		font-size: 0.85rem;
	}

	.tts-player__error button {
		all: unset;
		cursor: pointer;
		font-size: 1.2rem;
		line-height: 1;
		opacity: 0.7;
	}

	.tts-player__error button:hover {
		opacity: 1;
	}

	.tts-player--mini {
		position: fixed;
		top: auto;
		right: auto;
		bottom: 1.5rem;
		left: 50%;
		transform: translateX(-50%);
		background: transparent;
		/* background: color-mix(in srgb, var(--bg-color) 10%, transparent); */
		padding: 5px;
		border-radius: var(--radius-md);
		width: 260px;
		height: 70px;
		cursor: pointer;
		display: flex;
		align-items: center;
		padding-left: 8px;
		gap: 4px;
	}

	.tts-player--mini:focus-visible {
		outline: 2px solid var(--primary-color);
		outline-offset: 4px;
	}

	.tts-player-mini__content {
		display: flex;
		align-items: center;
		width: 100%;
		height: 100%;
		gap: 4px;
	}

	.tts-player-mini__voice {
		flex-shrink: 0;
		pointer-events: auto;
	}

	.tts-player-mini__voice :global(.voice-selector) {
		gap: 0;
	}

	.tts-player-mini__voice :global(.current-profile-card) {
		padding: 0.4rem;
		gap: 0;
	}

	.tts-player-mini__voice :global(.avatar-wrap) {
		width: 36px;
		height: 36px;
	}

	.tts-player-mini__voice :global(.avatar) {
		width: 36px;
		height: 36px;
	}

	.tts-player-mini__voice :global(.current-profile-meta),
	.tts-player-mini__voice :global(.current-profile-action) {
		display: none;
	}

	.tts-player-mini__canvas-clip {
		flex: 1;
		height: 100%;
		position: relative;
		border-radius: var(--radius-lg);
		overflow: hidden;
	}

	.tts-player-mini__canvas {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		display: block;
	}

	.tts-player-mini__error {
		position: absolute;
		bottom: calc(100% + 0.5rem);
		left: 50%;
		transform: translateX(-50%);
		white-space: nowrap;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.25rem 0.75rem;
		background: rgba(255, 80, 80, 0.15);
		border: 1px solid rgba(255, 80, 80, 0.4);
		border-radius: var(--radius-md);
		color: #ff5a5a;
		font-size: 0.75rem;
		z-index: 5;
	}

	.tts-player-mini__error button {
		all: unset;
		cursor: pointer;
		font-size: 1rem;
		line-height: 1;
		opacity: 0.7;
	}

	.tts-player-mini__error button:hover {
		opacity: 1;
	}
</style>
