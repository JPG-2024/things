<script lang="ts">
	import Icon from './Icon.svelte';
	import { ttsState } from '@/stores/ttsStore.svelte';
	import { fade } from 'svelte/transition';
	import { cubicInOut } from 'svelte/easing';

	import { createHotkey } from '@tanstack/svelte-hotkeys';
	import { getCurrentStyle } from '@/lib/ttsPlayerConfig';

	let canvas: HTMLCanvasElement | null = $state(null);
	let audioContext: AudioContext | null = $state(null);
	let currentSource: AudioBufferSourceNode | null = $state(null);
	let analyserNode: AnalyserNode | null = $state(null);
	let combinedBuffer: AudioBuffer | null = $state(null);
	let isSettingUp = false;
	let playbackStartTime = 0;
	let totalPlaybackDuration = 0;
	let countdownInterval: ReturnType<typeof setInterval> | null = null;

	let isPaused = $state(false);
	let pausedAt = 0;

	let animationFrame: number | null = null;
	const amplitudeScale = 0.3;
	const wavelengthScale = 100;

	const SINE_FILL_ALPHA = 0.24;
	const WAVE_STROKE_WIDTH = 3;
	const WAVE_STROKE_COLOR = 'white';

	const SPLINE_SAMPLE_STEP = 0.1;
	const SPLINE_SAMPLE_COUNT = Math.round(1 / SPLINE_SAMPLE_STEP);

	const MAX_WAVE_AMPLITUDE_PX = 80;
	const SEEK_SECONDS = 5;
	let elapsedSeconds = $state(0);

	function getAudioContext(): AudioContext {
		if (!audioContext) {
			audioContext = new AudioContext();
		}
		return audioContext;
	}

	async function ensureResumed() {
		const ctx = getAudioContext();
		if (ctx.state === 'suspended') {
			await ctx.resume();
		}
	}

	async function decodeBlob(blob: Blob): Promise<AudioBuffer> {
		const ctx = getAudioContext();
		const arrayBuffer = await blob.arrayBuffer();
		return ctx.decodeAudioData(arrayBuffer);
	}

	async function concatenateBlobs(blobs: Blob[]): Promise<AudioBuffer> {
		const ctx = getAudioContext();
		const decoded = await Promise.all(blobs.map((b) => decodeBlob(b)));

		if (decoded.length === 0) {
			throw new Error('No blobs to concatenate');
		}

		const sampleRate = decoded[0].sampleRate;
		const channels = decoded[0].numberOfChannels;
		const totalLength = decoded.reduce((acc, buf) => acc + buf.length, 0);

		const combined = ctx.createBuffer(channels, totalLength, sampleRate);

		let offset = 0;
		for (const buf of decoded) {
			for (let ch = 0; ch < channels; ch++) {
				combined.copyToChannel(buf.getChannelData(ch), ch, offset);
			}
			offset += buf.length;
		}

		return combined;
	}

	function startSource(offset: number) {
		const ctx = getAudioContext();
		const source = ctx.createBufferSource();
		source.buffer = combinedBuffer;

		const analyser = ctx.createAnalyser();
		analyser.fftSize = 1024;
		analyser.smoothingTimeConstant = 0.8;
		analyser.minDecibels = -90;
		analyser.maxDecibels = -10;

		source.connect(analyser);
		analyser.connect(ctx.destination);

		source.onended = () => {
			if (currentSource === source) {
				currentSource.disconnect();
				currentSource = null;
				analyserNode = null;
				if (!isPaused) {
					ttsState.isPlaying = false;
					clearCountdown();
				}
			}
		};

		source.start(0, offset);
		currentSource = source;
		analyserNode = analyser;
	}

	async function playBuffer() {
		if (isSettingUp || !combinedBuffer) return;
		isSettingUp = true;

		await ensureResumed();

		if (currentSource) {
			currentSource.onended = null;
			currentSource.stop();
			currentSource = null;
		}

		clearCountdown();

		startSource(0);
		playbackStartTime = performance.now();
		totalPlaybackDuration = ttsState.durationSeconds ?? combinedBuffer?.duration ?? 0;
		ttsState.isPlaying = true;
		isPaused = false;
		startCountdown();
		isSettingUp = false;
	}

	function pausePlayback() {
		if (!currentSource || !ttsState.isPlaying) return;
		pausedAt = (performance.now() - playbackStartTime) / 1000;
		isPaused = true;
		ttsState.isPlaying = false;
		clearCountdown();
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
		if (isSettingUp || !combinedBuffer || !isPaused) return;
		isSettingUp = true;

		await ensureResumed();

		startSource(pausedAt);
		playbackStartTime = performance.now() - pausedAt * 1000;
		ttsState.isPlaying = true;
		isPaused = false;
		startCountdown();
		isSettingUp = false;
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

	function stopPlayback() {
		if (currentSource) {
			currentSource.onended = null;
			currentSource.stop();
			currentSource.disconnect();
			currentSource = null;
		}
		cleanupAnalyser();
		clearCountdown();

		isPaused = false;
		pausedAt = 0;
		elapsedSeconds = 0;
		combinedBuffer = null;

		ttsState.isPlaying = false;
		ttsState.errorMessage = '';
	}

	function startCountdown() {
		clearCountdown();
		countdownInterval = setInterval(() => {
			const elapsed = (performance.now() - playbackStartTime) / 1000;
			elapsedSeconds = elapsed;
		}, 500);
	}

	function clearCountdown() {
		if (countdownInterval !== null) {
			clearInterval(countdownInterval);
			countdownInterval = null;
		}
	}

	function getCurrentPosition(): number {
		if (isPaused) return pausedAt;
		if (ttsState.isPlaying) return (performance.now() - playbackStartTime) / 1000;
		return 0;
	}

	function seekTo(offset: number) {
		const duration = totalPlaybackDuration || combinedBuffer?.duration || 0;
		const clamped = Math.max(0, Math.min(offset, duration));

		if (ttsState.isPlaying && currentSource) {
			currentSource.onended = null;
			currentSource.stop();
			currentSource.disconnect();
			currentSource = null;
			cleanupAnalyser();

			startSource(clamped);
			playbackStartTime = performance.now() - clamped * 1000;
			startCountdown();
		} else if (isPaused) {
			pausedAt = clamped;
			elapsedSeconds = clamped;
		}
	}

	function handleSeekForward() {
		if (!ttsState.isPlaying && !isPaused) return;
		seekTo(getCurrentPosition() + SEEK_SECONDS);
	}

	function handleSeekBackward() {
		if (!ttsState.isPlaying && !isPaused) return;
		seekTo(getCurrentPosition() - SEEK_SECONDS);
	}

	function formatTime(seconds: number): string {
		const m = Math.floor(seconds / 60);
		const s = seconds % 60;
		return `${m}:${s.toString().padStart(2, '0')}`;
	}

	async function startFresh() {
		if (ttsState.blobs.length === 0) return;
		if (!audioContext) {
			getAudioContext();
		}
		await ensureResumed();
		const buf = await concatenateBlobs(ttsState.blobs);
		combinedBuffer = buf;
		await playBuffer();
	}

	async function handlePrimaryClick() {
		if (ttsState.isGenerating) return;
		if (ttsState.isPlaying) {
			pausePlayback();
		} else if (isPaused) {
			await resumePlayback();
		} else {
			await startFresh();
		}
	}

	function handleStop() {
		stopPlayback();
	}

	createHotkey('Escape', handleStop, {
		stopPropagation: true,
		preventDefault: true
	});

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

		const sampleStep = Math.max(1, Math.floor((bufferLength / width / 2) * wavelengthScale));
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

		ctx.strokeStyle = WAVE_STROKE_COLOR;
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

		const config = getCurrentStyle();
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

		ctx.strokeStyle = `rgba(255, 255, 255, ${config.strokeAlpha})`;
		ctx.lineWidth = WAVE_STROKE_WIDTH;
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		ctx.stroke(path);
	}

	function startAnimation() {
		if (animationFrame !== null) return;

		const step = () => {
			if (analyserNode && ttsState.isPlaying && !isPaused) {
				drawWaveform();
			} else if (ttsState.isGenerating) {
				drawGeneratingWave();
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
		const shouldAnimate =
			ttsState.isGenerating || (analyserNode && ttsState.isPlaying && !isPaused);
		if (shouldAnimate) {
			startAnimation();
		} else {
			stopAnimation();
		}

		return () => stopAnimation();
	});

	$effect(() => {
		if (ttsState.blobs.length > 0 && ttsState.isPlaying && !combinedBuffer) {
			concatenateBlobs(ttsState.blobs).then((buf) => {
				combinedBuffer = buf;
				playBuffer();
			});
		} else if (ttsState.blobs.length === 0 && !isPaused) {
			combinedBuffer = null;
		}
	});

	$effect(() => {
		if (ttsState.isGenerating) {
			stopPlayback();
		}
	});

	$effect(() => {
		return () => {
			stopPlayback();
			if (audioContext) {
				audioContext.close();
				audioContext = null;
			}
		};
	});

	const panelVisible = $derived(
		!!combinedBuffer ||
			ttsState.isPlaying ||
			isPaused ||
			ttsState.isGenerating ||
			!!ttsState.errorMessage
	);
</script>

{#if panelVisible}
	<div
		in:fade={{ duration: 4000, easing: cubicInOut }}
		out:fade={{ duration: 80 }}
		class="tts-player"
	>
		<canvas bind:this={canvas} class="tts-player__canvas" aria-hidden="true"></canvas>

		{#if !ttsState.isGenerating}
			<div class="tts-player__controls">
				<button
					type="button"
					class="tts-player__btn"
					onclick={handlePrimaryClick}
					aria-label={ttsState.isPlaying ? 'Pause' : 'Play'}
				>
					{#if ttsState.isPlaying}
						<Icon name="Pause" size={22} />
					{:else}
						<Icon name="Play" size={22} />
					{/if}
				</button>
				{#if ttsState.isPlaying || isPaused}
					<button
						type="button"
						class="tts-player__btn tts-player__btn--stop"
						onclick={handleStop}
						aria-label="Stop"
					>
						<Icon name="Square" size={18} />
					</button>
				{/if}
				{#if ttsState.durationSeconds !== null && ttsState.durationSeconds > 0 && (ttsState.isPlaying || isPaused)}
					<span class="tts-player__time"
						>{formatTime(Math.floor(elapsedSeconds))} /
						{formatTime(Math.floor(totalPlaybackDuration))}</span
					>
				{/if}
			</div>
		{/if}

		{#if ttsState.errorMessage}
			<div class="tts-player__error">
				<span>{ttsState.errorMessage}</span>
				<button type="button" onclick={() => (ttsState.errorMessage = '')}>×</button>
			</div>
		{/if}
	</div>
{/if}

<style>
	.tts-player {
		position: fixed;
		inset: 0;
		border-radius: 16px;
		overflow: hidden;
		background: rgba(14, 14, 14, 0.9);
		box-shadow:
			0 0 0 1px rgba(255, 255, 255, 0.06),
			0 18px 48px rgba(0, 0, 0, 0.4);
		z-index: 1000;
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
		top: 70%;
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
		background: rgba(0, 0, 0, 0.3);
		color: var(--primary-color);
	}

	.tts-player__btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.tts-player__btn:not(:disabled):hover {
		background: rgba(255, 255, 255, 0.12);
	}

	.tts-player__btn--stop {
		width: 40px;
		height: 40px;
		background: rgba(0, 0, 0, 0.5);
	}

	.tts-player__time {
		background: rgba(0, 0, 0, 0.9);
		color: rgba(255, 255, 255, 0.9);
		font-size: 1rem;
		font-weight: bold;
		font-variant-numeric: tabular-nums;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
	}

	.tts-player__status {
		position: absolute;
		bottom: 1rem;
		left: 50%;
		transform: translateX(-50%);
		background: rgba(0, 0, 0, 0.9);
		color: var(--primary-color);
		font-size: 0.75rem;
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
</style>
