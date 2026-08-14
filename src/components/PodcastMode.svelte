<script lang="ts">
	import { fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { onMount, onDestroy } from 'svelte';
	import Icon from '@/components/Icon.svelte';
	import { podcastState } from '@/stores/podcastStore.svelte';
	import { drawersState, viewState } from '@/stores/viewStore.svelte';
	import { getImage } from '@/lib/utils/ttsService';
	import { createHotkey } from '@tanstack/svelte-hotkeys';
	import { getCurrentStyle } from '@/lib/ttsPlayerConfig';
	import { closeAudioContext } from '@/lib/audioContextManager';

	let { onExit }: { onExit: () => void } = $props();

	const config = getCurrentStyle();
	let canvas = $state<HTMLCanvasElement | null>(null);
	let transcriptContainer = $state<HTMLDivElement | null>(null);
	let animationFrame: number | null = null;

	const amplitudeScale = 0.1;
	const wavelengthScale = 300;
	const SINE_FILL_ALPHA = 0.24;
	const WAVE_STROKE_WIDTH = 4;
	const SPLINE_SAMPLE_STEP = 0.1;
	const SPLINE_SAMPLE_COUNT = Math.round(1 / SPLINE_SAMPLE_STEP);
	const MAX_WAVE_AMPLITUDE_PX = 10;

	const HOST_A_COLOR = 'hsl(220, 70%, 60%)';
	const HOST_B_COLOR = 'hsl(160, 70%, 50%)';
	const IDLE_COLOR = 'rgba(255, 255, 255, 0.4)';

	const statusLabel = $derived(
		podcastState.status === 'idle'
			? 'Press P to start'
			: podcastState.status === 'extracting'
				? 'Extracting topics...'
				: podcastState.status === 'generating'
					? 'Generating dialog...'
					: podcastState.status === 'paused'
						? 'Paused'
						: 'Playing...'
	);

	const waveColor = $derived(
		podcastState.activeSpeaker === 'A'
			? HOST_A_COLOR
			: podcastState.activeSpeaker === 'B'
				? HOST_B_COLOR
				: IDLE_COLOR
	);

	createHotkey(
		'Space',
		() => {
			if (podcastState.status === 'playing') {
				podcastState.pause();
			} else if (podcastState.status === 'paused') {
				podcastState.resume();
			}
		},
		{ stopPropagation: true, preventDefault: true }
	);

	createHotkey('Escape', handleExit, { stopPropagation: true, preventDefault: true });

	createHotkey(
		'ArrowRight',
		() => {
			if (podcastState.status === 'playing' || podcastState.status === 'paused') {
				// Skip is handled by stopping current and letting the main loop advance
				podcastState.stop();
			}
		},
		{ stopPropagation: true, preventDefault: true }
	);

	createHotkey(
		'R',
		() => {
			const t = podcastState.currentTopicIndex;
			const e = podcastState.currentExchangeIndex;
			if (podcastState.dialogs[t]?.[e]) {
				void podcastState.regenerateExchange(t, e);
			}
		},
		{ ignoreInputs: true, stopPropagation: true, preventDefault: true }
	);

	function hashHue(input: string): number {
		let hash = 5381;
		for (let i = 0; i < input.length; i++) {
			hash = (hash * 33) ^ input.charCodeAt(i);
		}
		return Math.abs(hash) % 360;
	}

	function colorFor(id: string): string {
		return `hsl(${hashHue(id)}, 60%, 50%)`;
	}

	function initialFor(label: string): string {
		const trimmed = label.trim();
		return trimmed.length ? trimmed[0].toUpperCase() : '?';
	}

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

	function drawWaveform(analyser: AnalyserNode, color: string) {
		if (!canvas) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		const width = canvas.clientWidth;
		const height = canvas.clientHeight;
		resizeCanvas(ctx, width, height);

		const bufferLength = analyser.frequencyBinCount;
		const dataArray = new Uint8Array(bufferLength);
		analyser.getByteTimeDomainData(dataArray);

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

		ctx.strokeStyle = color;
		ctx.lineWidth = WAVE_STROKE_WIDTH;
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		ctx.stroke(path);
	}

	function drawGeneratingWave(color: string) {
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

		ctx.strokeStyle = color;
		ctx.lineWidth = WAVE_STROKE_WIDTH;
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		ctx.stroke(path);
	}

	function drawIdleLine(color: string) {
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

		ctx.strokeStyle = color;
		ctx.lineWidth = WAVE_STROKE_WIDTH;
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		ctx.stroke(path);
	}

	function startAnimation() {
		if (animationFrame !== null) return;

		const step = () => {
			const analyser = podcastState.getAnalyserNode();
			const color = waveColor;

			if (analyser && podcastState.status === 'playing') {
				drawWaveform(analyser, color);
			} else if (podcastState.status === 'generating' || podcastState.status === 'extracting') {
				drawGeneratingWave(color);
			} else {
				drawIdleLine(color);
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

	function scrollToBottom() {
		if (transcriptContainer) {
			transcriptContainer.scrollTop = transcriptContainer.scrollHeight;
		}
	}

	function handleExit() {
		podcastState.fullReset();
		closeAudioContext();
		onExit();
	}

	onMount(() => {
		startAnimation();
	});

	onDestroy(() => {
		stopAnimation();
		podcastState.stop();
	});
</script>

<div
	in:fade={{ duration: 100, easing: cubicOut }}
	out:fade={{ duration: 200 }}
	class="podcast-mode"
>
	<div class="podcast-header">
		<div class="header-left">
			{#if podcastState.activeSpeaker}
				{@const speaker = podcastState.activeSpeaker}
				{@const profile = speaker === 'A' ? podcastState.hostAProfile : podcastState.hostBProfile}
				<div
					class="active-speaker-badge"
					class:speaker-a={speaker === 'A'}
					class:speaker-b={speaker === 'B'}
				>
					{#if profile?.image_src}
						<img class="badge-avatar" src={getImage(profile.image_src)} alt="" />
					{:else}
						<div class="badge-avatar fallback" style="background: {colorFor(profile?.id ?? '')}">
							{initialFor(profile?.name_prefix ?? speaker)}
						</div>
					{/if}
					<span class="badge-name">{podcastState.getProfileName(speaker)}</span>
				</div>
			{:else}
				<span class="status-label">{statusLabel}</span>
			{/if}
		</div>

		<div class="header-center">
			{#if podcastState.topics.length > 0}
				<span class="topic-badge">
					Topic {podcastState.currentTopicIndex + 1}/{podcastState.topics.length}
				</span>
			{/if}
		</div>

		<div class="header-right">
			<button
				type="button"
				class="header-btn"
				onclick={() => drawersState.toggle('podcast-settings')}
				aria-label="Podcast settings"
			>
				<Icon name="Settings" size={20} color={viewState.primaryColor} />
			</button>
			<button type="button" class="header-btn" onclick={handleExit} aria-label="Exit podcast">
				<Icon name="X" size={24} color={viewState.primaryColor} />
			</button>
		</div>
	</div>

	<div class="podcast-speakers">
		<div class="speaker-card" class:active={podcastState.activeSpeaker === 'A'}>
			<div class="speaker-avatar-wrap">
				{#if podcastState.hostAProfile?.image_src}
					<img class="speaker-avatar" src={getImage(podcastState.hostAProfile.image_src)} alt="" />
				{:else}
					<div
						class="speaker-avatar fallback"
						style="background: {colorFor(podcastState.hostAProfile?.id ?? '')}"
					>
						{initialFor(podcastState.hostAProfile?.name_prefix ?? 'A')}
					</div>
				{/if}
			</div>
			<span class="speaker-name">{podcastState.getProfileName('A')}</span>
		</div>

		<div class="vs-separator">VS</div>

		<div class="speaker-card" class:active={podcastState.activeSpeaker === 'B'}>
			<div class="speaker-avatar-wrap">
				{#if podcastState.hostBProfile?.image_src}
					<img class="speaker-avatar" src={getImage(podcastState.hostBProfile.image_src)} alt="" />
				{:else}
					<div
						class="speaker-avatar fallback"
						style="background: {colorFor(podcastState.hostBProfile?.id ?? '')}"
					>
						{initialFor(podcastState.hostBProfile?.name_prefix ?? 'B')}
					</div>
				{/if}
			</div>
			<span class="speaker-name">{podcastState.getProfileName('B')}</span>
		</div>
	</div>

	<div class="podcast-canvas-container">
		<canvas bind:this={canvas} class="podcast-canvas" aria-hidden="true"></canvas>
	</div>

	<div class="podcast-transcript" bind:this={transcriptContainer}>
		{#if podcastState.currentExchanges.length === 0 && podcastState.status === 'idle'}
			<div class="transcript-empty">
				<p>Select settings and start the podcast</p>
			</div>
		{/if}

		{#each podcastState.currentExchanges as exchange, i (i)}
			<div
				class="exchange"
				class:exchange-a={exchange.speaker === 'A'}
				class:exchange-b={exchange.speaker === 'B'}
				class:active={i === podcastState.currentExchangeIndex && podcastState.status !== 'idle'}
			>
				<div class="exchange-header">
					<span
						class="exchange-speaker"
						class:speaker-a={exchange.speaker === 'A'}
						class:speaker-b={exchange.speaker === 'B'}
					>
						Host {exchange.speaker}
					</span>
					{#if i === podcastState.currentExchangeIndex && (podcastState.status === 'playing' || podcastState.status === 'paused')}
						<button
							type="button"
							class="regen-btn"
							onclick={() =>
								void podcastState.regenerateExchange(podcastState.currentTopicIndex, i)}
							aria-label="Regenerate exchange"
							title="Regenerate (R)"
						>
							<Icon name="RotateCcw" size={14} />
						</button>
					{/if}
				</div>
				<p class="exchange-text">{exchange.text}</p>
			</div>
		{/each}

		{#if podcastState.isGenerating}
			<div class="exchange generating-indicator">
				<span class="typing-dots">
					<span></span><span></span><span></span>
				</span>
			</div>
		{/if}
	</div>

	{#if podcastState.progress.total > 0}
		<div class="podcast-progress">
			<div class="progress-bar">
				<div
					class="progress-fill"
					style="width: {(podcastState.progress.current / podcastState.progress.total) * 100}%"
				></div>
			</div>
			<span class="progress-text"
				>{podcastState.progress.current}/{podcastState.progress.total}</span
			>
		</div>
	{/if}

	{#if podcastState.status !== 'idle' || podcastState.dialogs.length > 0}
		<div class="podcast-controls">
			<button
				type="button"
				class="control-btn"
				onclick={() => {
					podcastState.stop();
				}}
				aria-label="Stop"
			>
				<Icon name="Square" size={20} />
			</button>

			<button
				type="button"
				class="control-btn control-btn-main"
				onclick={() => {
					if (podcastState.status === 'playing') {
						podcastState.pause();
					} else if (podcastState.status === 'paused') {
						podcastState.resume();
					}
				}}
				aria-label={podcastState.status === 'playing' ? 'Pause' : 'Play'}
			>
				<Icon name={podcastState.status === 'playing' ? 'Pause' : 'Play'} size={28} />
			</button>

			<button
				type="button"
				class="control-btn"
				onclick={() => {
					const t = podcastState.currentTopicIndex;
					const e = podcastState.currentExchangeIndex;
					if (podcastState.dialogs[t]?.[e]) {
						void podcastState.regenerateExchange(t, e);
					}
				}}
				aria-label="Regenerate current exchange"
			>
				<Icon name="RotateCcw" size={20} />
			</button>
		</div>
	{/if}

	{#if podcastState.errorMessage}
		<div class="podcast-error">
			<span>{podcastState.errorMessage}</span>
			<button type="button" onclick={() => (podcastState.errorMessage = '')}>×</button>
		</div>
	{/if}
</div>

<style>
	.podcast-mode {
		display: flex;
		flex-direction: column;
		position: fixed;
		inset: 0;
		overflow: hidden;
		background: rgba(14, 14, 14, 0.97);
		z-index: 1100;
		font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
	}

	.podcast-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1.5rem;
		flex-shrink: 0;
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		min-width: 180px;
	}

	.header-center {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 180px;
		justify-content: flex-end;
	}

	.status-label {
		color: rgba(255, 255, 255, 0.5);
		font-size: 0.8rem;
	}

	.topic-badge {
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.5);
		padding: 0.25rem 0.75rem;
		border-radius: 999px;
		border: 1px solid rgba(255, 255, 255, 0.1);
	}

	.active-speaker-badge {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.25rem 0.75rem 0.25rem 0.25rem;
		border-radius: 999px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(255, 255, 255, 0.05);
	}

	.active-speaker-badge.speaker-a {
		border-color: hsl(220, 70%, 60%);
		background: hsla(220, 70%, 60%, 0.1);
	}

	.active-speaker-badge.speaker-b {
		border-color: hsl(160, 70%, 50%);
		background: hsla(160, 70%, 50%, 0.1);
	}

	.badge-avatar {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		object-fit: cover;
	}

	.badge-name {
		font-size: 0.8rem;
		color: rgba(255, 255, 255, 0.8);
		font-weight: 500;
	}

	.header-btn {
		all: unset;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border-radius: 50%;
		opacity: 0.6;
		transition: opacity 0.2s;
	}

	.header-btn:hover {
		opacity: 1;
	}

	.podcast-speakers {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 2rem;
		padding: 0.5rem 2rem;
		flex-shrink: 0;
	}

	.speaker-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.4rem;
		opacity: 0.5;
		transition:
			opacity 0.3s,
			transform 0.3s;
	}

	.speaker-card.active {
		opacity: 1;
		transform: scale(1.05);
	}

	.speaker-avatar-wrap {
		width: 64px;
		height: 64px;
		border-radius: 50%;
		overflow: hidden;
		border: 2px solid rgba(255, 255, 255, 0.1);
		transition: border-color 0.3s;
	}

	.speaker-card.active .speaker-avatar-wrap {
		border-color: var(--primary-color);
	}

	.speaker-avatar {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.fallback {
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		font-weight: bold;
		font-size: 1.2rem;
		width: 100%;
		height: 100%;
	}

	.speaker-name {
		font-size: 0.8rem;
		color: rgba(255, 255, 255, 0.7);
		font-weight: 500;
	}

	.vs-separator {
		font-size: 0.7rem;
		color: rgba(255, 255, 255, 0.25);
		font-weight: bold;
		letter-spacing: 0.1em;
	}

	.podcast-canvas-container {
		width: 100%;
		height: 100px;
		flex-shrink: 0;
	}

	.podcast-canvas {
		width: 100%;
		height: 100%;
		display: block;
	}

	.podcast-transcript {
		flex: 1;
		overflow-y: auto;
		padding: 1rem 2rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		scroll-behavior: smooth;
	}

	.transcript-empty {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: rgba(255, 255, 255, 0.2);
		font-size: 0.95rem;
	}

	.exchange {
		max-width: 80%;
		padding: 0.5rem 0.75rem;
		border-radius: 10px;
		line-height: 1.5;
		transition: opacity 0.2s;
	}

	.exchange:not(.active) {
		opacity: 0.5;
	}

	.exchange.active {
		opacity: 1;
	}

	.exchange-a {
		align-self: flex-start;
		background: hsla(220, 70%, 60%, 0.1);
		border: 1px solid hsla(220, 70%, 60%, 0.2);
	}

	.exchange-b {
		align-self: flex-end;
		background: hsla(160, 70%, 50%, 0.1);
		border: 1px solid hsla(160, 70%, 50%, 0.2);
	}

	.exchange-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.2rem;
	}

	.exchange-speaker {
		font-size: 0.65rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-weight: 600;
	}

	.exchange-speaker.speaker-a {
		color: hsl(220, 70%, 60%);
	}

	.exchange-speaker.speaker-b {
		color: hsl(160, 70%, 50%);
	}

	.regen-btn {
		all: unset;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		color: rgba(255, 255, 255, 0.4);
		transition:
			color 0.2s,
			background 0.2s;
	}

	.regen-btn:hover {
		color: var(--primary-color);
		background: rgba(255, 255, 255, 0.05);
	}

	.exchange-text {
		margin: 0;
		font-size: 0.9rem;
		color: rgba(255, 255, 255, 0.85);
		white-space: pre-wrap;
		word-wrap: break-word;
	}

	.generating-indicator {
		align-self: flex-start;
		padding: 0.5rem 1rem;
	}

	.typing-dots {
		display: flex;
		gap: 4px;
		align-items: center;
	}

	.typing-dots span {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.3);
		animation: typing-bounce 1.4s infinite ease-in-out;
	}

	.typing-dots span:nth-child(2) {
		animation-delay: 0.2s;
	}

	.typing-dots span:nth-child(3) {
		animation-delay: 0.4s;
	}

	@keyframes typing-bounce {
		0%,
		80%,
		100% {
			transform: scale(0.6);
			opacity: 0.3;
		}
		40% {
			transform: scale(1);
			opacity: 1;
		}
	}

	.podcast-progress {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0 2rem;
		flex-shrink: 0;
	}

	.progress-bar {
		flex: 1;
		height: 4px;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 2px;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: var(--primary-color);
		border-radius: 2px;
		transition: width 0.3s ease;
	}

	.progress-text {
		font-size: 0.7rem;
		color: rgba(255, 255, 255, 0.4);
		min-width: 40px;
		text-align: right;
	}

	.podcast-controls {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1.5rem;
		padding: 0.75rem 2rem;
		flex-shrink: 0;
	}

	.control-btn {
		all: unset;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		border-radius: 50%;
		color: rgba(255, 255, 255, 0.6);
		border: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(255, 255, 255, 0.04);
		transition: all 0.2s;
	}

	.control-btn:hover {
		color: rgba(255, 255, 255, 0.9);
		border-color: rgba(255, 255, 255, 0.2);
		background: rgba(255, 255, 255, 0.08);
	}

	.control-btn-main {
		width: 56px;
		height: 56px;
		color: var(--primary-color);
		border-color: var(--primary-color);
		background: color-mix(in srgb, var(--primary-color) 10%, transparent);
	}

	.control-btn-main:hover {
		background: color-mix(in srgb, var(--primary-color) 20%, transparent);
		color: var(--primary-color);
		border-color: var(--primary-color);
	}

	.podcast-error {
		position: absolute;
		bottom: 5rem;
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
		z-index: 5;
	}

	.podcast-error button {
		all: unset;
		cursor: pointer;
		font-size: 1.2rem;
		line-height: 1;
		opacity: 0.7;
	}

	.podcast-error button:hover {
		opacity: 1;
	}
</style>
