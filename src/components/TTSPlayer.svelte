<script lang="ts">
	import { ttsState } from '@/stores/ttsStore.svelte';
	import { fade, fly } from 'svelte/transition';
	import Icon from '@/components/Icon.svelte';
	import { createHotkey } from '@tanstack/svelte-hotkeys';
	import { getCurrentStyle, type PlayerMode } from '@/lib/ttsPlayerConfig';
	import {
		getAudioContext,
		ensureAudioContext,
		resetAudioContext,
		closeAudioContext
	} from '@/lib/audioContextManager';
	import { viewState, drawersState } from '@/stores/viewStore.svelte';

	const config = getCurrentStyle();

	let { mode = $bindable<PlayerMode>('full') }: { mode?: PlayerMode } = $props();
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
	const amplitudeScale = $derived(mode === 'mini' ? 1.4 : 0.4);
	const wavelengthScale = 300;

	let showControls = $state(true);
	let hideControlsTimeout: ReturnType<typeof setTimeout> | null = null;

	const SINE_FILL_ALPHA = 0.24;
	const WAVE_STROKE_WIDTH = 4;
	//const WAVE_STROKE_COLOR = 'white';

	const SPLINE_SAMPLE_STEP = 0.1;
	const SPLINE_SAMPLE_COUNT = Math.round(1 / SPLINE_SAMPLE_STEP);
	const MIN_WAVE_POINTS = 4;

	const MAX_WAVE_AMPLITUDE_PX = 80;
	const SEEK_SECONDS = 5;
	const PREBUFFER_RATIO = 0.3;
	const MIN_PREBUFFER = 1.5;
	let elapsedSeconds = $state(0);
	let totalPlaybackDuration = $state(0);
	let nextChunkPrefetchRequested = false;
	let currentChunkDuration = 0;

	async function decodeBlob(blob: Blob, ctx: AudioContext): Promise<AudioBuffer> {
		const arrayBuffer = await blob.arrayBuffer();
		return ctx.decodeAudioData(arrayBuffer);
	}

	function setTtsError(err: unknown, fallback: string) {
		ttsState.errorMessage = err instanceof Error ? err.message : fallback;
		console.error('[TTS]', err);
	}

	function recomputeChunkOffsets() {
		chunkOffsets = [];
		let cumulative = 0;
		for (const buf of decodedChunks) {
			chunkOffsets.push(cumulative);
			cumulative += buf?.duration ?? 0;
		}
	}

	function computeTotalDuration(): number {
		let total = 0;
		for (const buf of decodedChunks) total += buf?.duration ?? 0;
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
				currentSource.onended = null;
				try {
					currentSource.stop();
				} catch {
					// ignore
				}
				currentSource.disconnect();
				currentSource = null;
			}

			cleanupAnalyser();

			const ctx = getAudioContext();
			const source = ctx.createBufferSource();
			source.buffer = buf;

			const analyser = ctx.createAnalyser();
			analyser.fftSize = 1024;
			analyser.smoothingTimeConstant = 0.8;
			analyser.minDecibels = -90;
			analyser.maxDecibels = -10;

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
		if (currentSource) {
			currentSource.onended = null;
			currentSource.disconnect();
			currentSource = null;
		}
		cleanupAnalyser();

		const nextIdx = currentChunkIndex + 1;
		if (nextIdx < ttsState.blobs.length) {
			if (decodedChunks[nextIdx] || ttsState.blobs[nextIdx]) {
				void playChunkAt(nextIdx);
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
		if (hideControlsTimeout !== null) {
			clearTimeout(hideControlsTimeout);
			hideControlsTimeout = null;
		}
		showControls = true;
		currentSource.onended = null;
		try {
			currentSource.stop();
		} catch {
			// ignore stop errors
		}
		currentSource.disconnect();
		currentSource = null;
		cleanupAnalyser();
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

	function cleanupAnalyser() {
		if (analyserNode) {
			try {
				analyserNode.disconnect();
			} catch {
				// ignore disconnect errors
			}
			analyserNode = null;
		}
	}

	function cleanupPlayback() {
		if (currentSource) {
			currentSource.onended = null;
			currentSource.stop();
			currentSource.disconnect();
			currentSource = null;
		}
		cleanupAnalyser();
		clearCountdown();
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
		clearCanvas();
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
					currentSource.onended = null;
					currentSource.stop();
					currentSource.disconnect();
					currentSource = null;
					cleanupAnalyser();
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
		mode = 'full';
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

	function catmullRomSpline(p0: number, p1: number, p2: number, p3: number, t: number): number {
		const t2 = t * t;
		const t3 = t2 * t;
		return (
			0.5 *
			(2 * p1 +
				(-p0 + p2) * t +
				(2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
				(-p0 + 3 * p1 - 3 * p2 + p3) * t3)
		);
	}

	function resizeCanvas(ctx: CanvasRenderingContext2D, width: number, height: number) {
		const pixelRatio = window.devicePixelRatio || 1;
		const scaledWidth = Math.floor(width * pixelRatio);
		const scaledHeight = Math.floor(height * pixelRatio);

		if (canvas!.width !== scaledWidth || canvas!.height !== scaledHeight) {
			canvas!.width = scaledWidth;
			canvas!.height = scaledHeight;
			ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
		}
	}

	function drawWaveform() {
		if (!canvas || !analyserNode) {
			return;
		}

		const ctx = canvas.getContext('2d');
		if (!ctx) {
			return;
		}

		const width = canvas.clientWidth;
		const height = canvas.clientHeight;
		resizeCanvas(ctx, width, height);

		const bufferLength = analyserNode.frequencyBinCount;
		const dataArray = new Uint8Array(bufferLength);
		analyserNode.getByteTimeDomainData(dataArray);

		ctx.clearRect(0, 0, width, height);
		ctx.fillStyle = `rgba(0, 0, 0, ${SINE_FILL_ALPHA})`;
		ctx.fillRect(0, 0, width, height);

		let sampleStep = Math.max(1, Math.floor((bufferLength / width / 2) * wavelengthScale));
		if (bufferLength / sampleStep < MIN_WAVE_POINTS) {
			sampleStep = Math.floor(bufferLength / MIN_WAVE_POINTS);
		}
		const points: number[] = [];

		for (let i = 0; i < bufferLength; i += sampleStep) {
			const value = dataArray[i];
			const normalized = (value / 255 - 0.5) * height * amplitudeScale;
			const y = height / 2 - normalized;
			points.push(y);
		}

		const path = new Path2D();
		const pixelStep = width / (points.length - 1);

		if (points.length >= 2) {
			path.moveTo(0, points[0]);

			for (let i = 0; i < points.length - 1; i += 1) {
				const p0 = points[i - 1] ?? points[0];
				const p1 = points[i];
				const p2 = points[i + 1];
				const p3 = points[i + 2] ?? points[points.length - 1];

				for (let j = 1; j <= SPLINE_SAMPLE_COUNT; j += 1) {
					const t = j * SPLINE_SAMPLE_STEP;
					const y = catmullRomSpline(p0, p1, p2, p3, t);
					const x = (i + t) * pixelStep;
					path.lineTo(x, y);
				}
			}
		}

		ctx.strokeStyle = viewState.primaryColorAlpha(config.strokeAlpha);
		ctx.lineWidth = WAVE_STROKE_WIDTH;
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		ctx.stroke(path);
	}

	function drawGeneratingWave() {
		if (!canvas) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		const width = canvas.clientWidth;
		const height = canvas.clientHeight;
		if (width === 0 || height === 0) return;

		resizeCanvas(ctx, width, height);

		const t = performance.now() / 1000;
		const amplitude = Math.min(height * config.amplitude, MAX_WAVE_AMPLITUDE_PX);
		const pointCount = config.pointCount;
		const phaseSpeed = config.baseSpeed;

		ctx.clearRect(0, 0, width, height);
		ctx.fillStyle = `rgba(0, 0, 0, ${SINE_FILL_ALPHA})`;
		ctx.fillRect(0, 0, width, height);

		const points: number[] = [];
		for (let i = 0; i < pointCount; i += 1) {
			const u = pointCount === 1 ? 0 : i / (pointCount - 1);
			let y = height / 2;
			for (const h of config.harmonics) {
				y +=
					amplitude *
					h.amplitudeRatio *
					Math.sin(2 * Math.PI * h.cycles * u - t * phaseSpeed * h.speedRatio);
			}
			points.push(y);
		}

		const path = new Path2D();
		const pixelStep = width / (points.length - 1);

		if (points.length >= 2) {
			path.moveTo(0, points[0]);

			for (let i = 0; i < points.length - 1; i += 1) {
				const p0 = points[i - 1] ?? points[0];
				const p1 = points[i];
				const p2 = points[i + 1];
				const p3 = points[i + 2] ?? points[points.length - 1];

				for (let j = 1; j <= SPLINE_SAMPLE_COUNT; j += 1) {
					const tt = j * SPLINE_SAMPLE_STEP;
					const y = catmullRomSpline(p0, p1, p2, p3, tt);
					const x = (i + tt) * pixelStep;
					path.lineTo(x, y);
				}
			}
		}

		ctx.strokeStyle = viewState.primaryColorAlpha(config.strokeAlpha);
		ctx.lineWidth = WAVE_STROKE_WIDTH;
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		ctx.stroke(path);
	}

	function clearCanvas() {
		if (!canvas) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
	}

	function drawIdleLine() {
		if (!canvas) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		const width = canvas.clientWidth;
		const height = canvas.clientHeight;
		if (width === 0 || height === 0) return;

		resizeCanvas(ctx, width, height);

		ctx.clearRect(0, 0, width, height);
		ctx.fillStyle = `rgba(0, 0, 0, ${SINE_FILL_ALPHA})`;
		ctx.fillRect(0, 0, width, height);

		const path = new Path2D();
		path.moveTo(0, height / 2);
		path.lineTo(width, height / 2);

		ctx.strokeStyle = viewState.primaryColorAlpha(config.strokeAlpha);
		ctx.lineWidth = WAVE_STROKE_WIDTH;
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		ctx.stroke(path);
	}

	function startAnimation() {
		if (animationFrame !== null) return;

		const step = () => {
			if (analyserNode && ttsState.isPlaying && !ttsState.isPaused) {
				drawWaveform();
			} else if (
				ttsState.addVoiceLoading ||
				(ttsState.isGenerating && ttsState.chunksGenerated === 0)
			) {
				drawGeneratingWave();
			} else if (ttsState.isGenerating || waitingForChunk) {
				drawIdleLine();
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
				<!-- 			<div class="tts-player__picture-container">
					<img src={viewState.hoveredPictureSrc} alt="article" class="tts-player__content-picture" />
				</div> -->
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
			<div class="tts-player-mini__canvas-clip" transition:fly={{ duration: 200, y: -200 }}>
				<canvas bind:this={canvas} class="tts-player-mini__canvas" aria-hidden="true"></canvas>
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
		border-radius: 20px;
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
		border-radius: 8px;
		z-index: 5;
	}

	.tts-player__time {
		color: var(--primary-color);
		opacity: 0.8;
		font-size: 1.2rem;
		font-weight: bold;
		font-variant-numeric: tabular-nums;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
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
		border-radius: 8px;
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
		width: 200px;
		height: 70px;
		border-radius: 30%;
		background: rgba(14, 14, 14, 0.9);
		box-shadow: 0 4px 35px rgba(0, 0, 0, 0.8);
		cursor: pointer;
	}

	.tts-player--mini:focus-visible {
		outline: 2px solid var(--primary-color);
		outline-offset: 4px;
	}

	.tts-player-mini__canvas-clip {
		position: absolute;
		inset: 0;
		border-radius: 50%;
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
		border-radius: 8px;
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
