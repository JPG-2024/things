<script lang="ts">
	import { fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { onMount, onDestroy } from 'svelte';
	import Icon from '@/components/Icon.svelte';
	import MiniProfilePicker from '@/components/TTSPlayer/MiniProfilePicker.svelte';
	import VoiceSettingsModal from '@/components/modals/VoiceSettingsModal.svelte';
	import { getImage, type VoiceProfile } from '@/lib/utils/ttsService';
	import { colorFor, initialFor } from '@/lib/utils/avatar';
	import type { SynthParams } from '@/types/tts.types';
	import { podcastState } from '@/features/podcast/podcastStore.svelte';
	import { drawersState, viewState } from '@/stores/viewStore.svelte';
	import { createHotkey } from '@tanstack/svelte-hotkeys';
	import { getCurrentStyle } from '@/lib/ttsPlayerConfig';
	import { closeAudioContext } from '@/lib/audioContextManager';
	import {
		drawWaveform as drawWaveformShared,
		drawGeneratingWave as drawGeneratingWaveShared,
		drawIdleLine as drawIdleLineShared,
		type WaveformDrawConfig
	} from '@/lib/canvasWaveform';
	import PodcastMini from './PodcastMini.svelte';

	let { onExit }: { onExit: () => void } = $props();

	const config = getCurrentStyle();
	let canvas = $state<HTMLCanvasElement | null>(null);
	let animationFrame: number | null = null;
	let showTranscript = $state(false);
	let mode = $state<'mini' | 'full'>('mini');
	let pickingHost = $state<'A' | 'B' | null>(null);
	let settingsHost = $state<'A' | 'B' | null>(null);
	let fullPickerFilter = $state('');

	const DEFAULT_HOST_SYNTH: SynthParams = {
		numStep: 16,
		guidanceScale: 2.0,
		speed: 1.0,
		splitLevel: 1
	};

	let hostAChunks = $derived(podcastState.getChunksForProfile(podcastState.config.hostAProfileId));
	let hostBChunks = $derived(podcastState.getChunksForProfile(podcastState.config.hostBProfileId));

	const amplitudeScale = 0.8;
	const wavelengthScale = 300;

	const waveDrawConfig: WaveformDrawConfig = {
		splineSampleStep: 0.3,
		amplitudeScale,
		maxWaveAmplitudePx: 15,
		wavelengthScale,
		sineFillAlpha: 0.24,
		strokeWidth: 4
	};

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

	const waveColor = $derived(`rgba(255, 255, 255, ${config.strokeAlpha})`);

	const hasContent = $derived(podcastState.status !== 'idle' || podcastState.dialogs.length > 0);

	createHotkey(
		'Space',
		() => {
			if (podcastState.status === 'playing') {
				podcastState.pause();
			} else if (podcastState.status === 'paused') {
				podcastState.resume();
			}
		},
		{ ignoreInputs: true, stopPropagation: true, preventDefault: true }
	);

	createHotkey(
		'Escape',
		() => {
			if (settingsHost !== null) {
				settingsHost = null;
			} else if (pickingHost !== null) {
				pickingHost = null;
			} else if (mode === 'full') {
				mode = 'mini';
			} else {
				handleExit();
			}
		},
		{ stopPropagation: true, preventDefault: true }
	);

	createHotkey(
		'ArrowRight',
		() => {
			if (podcastState.status === 'playing' || podcastState.status === 'paused') {
				// Skip is handled by stopping current and letting the main loop advance
				podcastState.stop();
			}
		},
		{ ignoreInputs: true, stopPropagation: true, preventDefault: true }
	);

	createHotkey(
		'R',
		() => {
			const t = podcastState.currentTopicIndex;
			if (podcastState.dialogs[t]?.length) {
				void podcastState.regenerateTopic(t);
			}
		},
		{ ignoreInputs: true, stopPropagation: true, preventDefault: true }
	);

	createHotkey(
		'P',
		() => {
			if (podcastState.status === 'idle') {
				void podcastState.start();
			}
		},
		{ ignoreInputs: true, stopPropagation: true, preventDefault: true }
	);

	createHotkey(
		'H',
		() => {
			handleRandomizeHosts();
		},
		{ ignoreInputs: true, stopPropagation: true, preventDefault: true }
	);

	function drawLocalWaveform(analyser: AnalyserNode, color: string) {
		if (!canvas) return;
		drawWaveformShared(canvas, analyser, color, waveDrawConfig);
	}

	function drawLocalGeneratingWave(color: string) {
		if (!canvas) return;
		drawGeneratingWaveShared(canvas, color, config, waveDrawConfig);
	}

	function drawLocalIdleLine(color: string) {
		if (!canvas) return;
		drawIdleLineShared(canvas, color, waveDrawConfig);
	}

	function startAnimation() {
		if (animationFrame !== null) return;

		const step = () => {
			const analyser = podcastState.getAnalyserNode();
			const color = waveColor;

			if (analyser && podcastState.status === 'playing') {
				drawLocalWaveform(analyser, color);
			} else if (podcastState.status === 'generating' || podcastState.status === 'extracting') {
				drawLocalGeneratingWave(color);
			} else {
				drawLocalIdleLine(color);
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

	function handleExit() {
		podcastState.fullReset();
		closeAudioContext();
		onExit();
	}

	function handleRandomizeHosts() {
		const wasActive = podcastState.status !== 'idle';
		podcastState.stop();
		podcastState.randomizeHosts();
		if (wasActive) {
			void podcastState.start();
		}
	}

	function handlePickHost(host: 'A' | 'B', profile: VoiceProfile) {
		if (host === 'A') {
			podcastState.config.hostAProfileId = profile.id;
			podcastState.config.hostAChunkFile = '';
			podcastState.config.hostARandomChunk = true;
		} else {
			podcastState.config.hostBProfileId = profile.id;
			podcastState.config.hostBChunkFile = '';
			podcastState.config.hostBRandomChunk = true;
		}
		pickingHost = null;
	}

	const settingsChunks = $derived(
		settingsHost === 'A' ? hostAChunks : settingsHost === 'B' ? hostBChunks : []
	);

	const settingsAudioFile = $derived(
		settingsHost === 'A'
			? podcastState.config.hostAChunkFile || hostAChunks[0]?.audio_file || ''
			: settingsHost === 'B'
				? podcastState.config.hostBChunkFile || hostBChunks[0]?.audio_file || ''
				: ''
	);

	const settingsRandomChunk = $derived(
		settingsHost === 'A'
			? podcastState.config.hostARandomChunk
			: settingsHost === 'B'
				? podcastState.config.hostBRandomChunk
				: false
	);

	const settingsSynth = $derived(
		settingsHost === 'A'
			? podcastState.config.hostASynthParams
			: settingsHost === 'B'
				? podcastState.config.hostBSynthParams
				: DEFAULT_HOST_SYNTH
	);

	function applyHostSettings(value: {
		audioFile: string;
		randomChunk: boolean;
		synthParams: SynthParams;
		pauseSettings: { minGapMs: number; maxGapMs: number; betweenParagraphs: number };
	}) {
		const host = settingsHost;
		if (!host) return;
		const synth = { ...value.synthParams };
		if (host === 'A') {
			podcastState.config.hostAChunkFile = value.audioFile;
			podcastState.config.hostARandomChunk = value.randomChunk;
			podcastState.config.hostASynthParams = synth;
		} else {
			podcastState.config.hostBChunkFile = value.audioFile;
			podcastState.config.hostBRandomChunk = value.randomChunk;
			podcastState.config.hostBSynthParams = synth;
		}
	}

	function openHostSettings(host: 'A' | 'B') {
		settingsHost = host;
	}

	function hostProfile(host: 'A' | 'B'): VoiceProfile | undefined {
		return host === 'A' ? podcastState.hostAProfile : podcastState.hostBProfile;
	}

	function hostIsDimmed(host: 'A' | 'B'): boolean {
		return podcastState.activeSpeaker !== null && podcastState.activeSpeaker !== host;
	}

	onMount(() => {
		void podcastState.loadProfiles();
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
	class:podcast-mode--mini={mode === 'mini'}
	class:podcast-mode--picking={mode === 'mini' && pickingHost !== null}
>
	{#if mode === 'mini'}
		<div class="podcast-mini-bar">
			<PodcastMini
				{pickingHost}
				onOpenPicker={(host) => (pickingHost = host)}
				onClosePicker={() => (pickingHost = null)}
				onOpenHostSettings={() => {
					const host = pickingHost;
					pickingHost = null;
					if (host) openHostSettings(host);
				}}
				onExpand={() => {
					pickingHost = null;
					mode = 'full';
				}}
			/>
			<!-- 			<button
				type="button"
				class="podcast-mini-bar__expand"
				onclick={() => (mode = 'full')}
				aria-label="Expand to full podcast"
				title="Expand"
			>
				<Icon name="Maximize2" size={18} />
			</button>
			<button
				type="button"
				class="podcast-mini-bar__exit"
				onclick={handleExit}
				aria-label="Exit podcast"
			>
				<Icon name="X" size={18} />
			</button> -->
		</div>
	{:else}
		<div class="podcast-header">
			<div class="header-left">
				{#if !podcastState.activeSpeaker}
					<span class="status-label">{statusLabel}</span>
				{/if}
			</div>

			<div class="header-right">
				<button
					type="button"
					class="header-btn"
					onclick={() => (showTranscript = !showTranscript)}
					aria-label={showTranscript ? 'Hide transcript' : 'Show transcript'}
				>
					<Icon
						name={showTranscript ? 'MessageSquare' : 'MessageSquareOff'}
						size={20}
						color={viewState.primaryColor}
					/>
				</button>
				<button
					type="button"
					class="header-btn"
					onclick={handleRandomizeHosts}
					aria-label="Randomize hosts"
					title="Randomize hosts (H)"
				>
					<Icon name="Shuffle" size={20} color={viewState.primaryColor} />
				</button>
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

		<div class="podcast-body" class:flex-1={!showTranscript}>
			<div class="podcast-stage">
				{#if hasContent && podcastState.currentTopic}
					<div class="current-topic-bar">
						<span class="topic-index"
							>Topic {podcastState.currentTopicIndex + 1}/{podcastState.topics.length}</span
						>
						<span class="topic-text">{podcastState.currentTopic}</span>
					</div>
				{/if}
				<div class="podcast-speakers">
					<button
						type="button"
						class="podcast-host"
						class:dimmed={hostIsDimmed('A')}
						onclick={() => (pickingHost = 'A')}
						aria-label={hostProfile('A')
							? `Change Host A voice. Currently ${hostProfile('A')?.name_prefix}`
							: 'Choose Host A voice'}
					>
						<div class="podcast-host__avatar-wrap">
							{#if hostProfile('A')?.image_src}
								<img
									class="podcast-host__avatar"
									src={getImage(hostProfile('A')?.image_src ?? '')}
									alt={hostProfile('A')?.name_prefix}
								/>
							{:else}
								<div
									class="podcast-host__avatar fallback"
									style="background: {colorFor(hostProfile('A')?.id ?? '')}"
								>
									<span>{initialFor(hostProfile('A')?.name_prefix ?? 'A')}</span>
								</div>
							{/if}
						</div>
						<span class="podcast-host__name">{hostProfile('A')?.name_prefix ?? 'Host A'}</span>
					</button>
					<span class="vs-separator">VS</span>
					<button
						type="button"
						class="podcast-host"
						class:dimmed={hostIsDimmed('B')}
						onclick={() => (pickingHost = 'B')}
						aria-label={hostProfile('B')
							? `Change Host B voice. Currently ${hostProfile('B')?.name_prefix}`
							: 'Choose Host B voice'}
					>
						<div class="podcast-host__avatar-wrap">
							{#if hostProfile('B')?.image_src}
								<img
									class="podcast-host__avatar"
									src={getImage(hostProfile('B')?.image_src ?? '')}
									alt={hostProfile('B')?.name_prefix}
								/>
							{:else}
								<div
									class="podcast-host__avatar fallback"
									style="background: {colorFor(hostProfile('B')?.id ?? '')}"
								>
									<span>{initialFor(hostProfile('B')?.name_prefix ?? 'B')}</span>
								</div>
							{/if}
						</div>
						<span class="podcast-host__name">{hostProfile('B')?.name_prefix ?? 'Host B'}</span>
					</button>
				</div>

				<div class="podcast-canvas-container">
					{#if hasContent}
						<canvas bind:this={canvas} class="podcast-canvas" aria-hidden="true"></canvas>
					{/if}
				</div>
			</div>

			<div class="podcast-controls">
				{#if hasContent}
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
				{/if}

				<button
					type="button"
					class="control-btn control-btn-main"
					onclick={() => {
						if (podcastState.status === 'idle') {
							void podcastState.start();
						} else if (podcastState.status === 'playing') {
							podcastState.pause();
						} else if (podcastState.status === 'paused') {
							podcastState.resume();
						}
					}}
					aria-label={podcastState.status === 'playing' ? 'Pause' : 'Play'}
				>
					<Icon name={podcastState.status === 'playing' ? 'Pause' : 'Play'} size={28} />
				</button>

				{#if hasContent}
					<button
						type="button"
						class="control-btn"
						onclick={() => {
							const t = podcastState.currentTopicIndex;
							if (podcastState.dialogs[t]?.length) {
								void podcastState.regenerateTopic(t);
							}
						}}
						aria-label="Regenerate current topic"
					>
						<Icon name="RotateCcw" size={20} />
					</button>
				{/if}
			</div>
		</div>

		{#if showTranscript}
			<div class="podcast-transcript">
				{#if podcastState.currentExchanges.length === 0 && podcastState.status === 'idle'}
					<div class="transcript-empty">
						<p>Select settings and start the podcast</p>
					</div>
				{/if}

				{#each podcastState.currentExchanges.slice(0, podcastState.currentExchangeIndex + 1) as exchange, i (i)}
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
									onclick={() => void podcastState.regenerateTopic(podcastState.currentTopicIndex)}
									aria-label="Regenerate topic"
									title="Regenerate topic (R)"
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
		{/if}
	{/if}

	{#if mode === 'full' && pickingHost}
		<div class="podcast-picker-overlay">
			<MiniProfilePicker
				bind:filter={fullPickerFilter}
				profiles={podcastState.profiles}
				selectedProfileId={pickingHost === 'A'
					? podcastState.config.hostAProfileId
					: podcastState.config.hostBProfileId}
				label={pickingHost === 'A' ? 'Host A' : 'Host B'}
				onPick={(profile) => handlePickHost(pickingHost ?? 'A', profile)}
				actionIcon="X"
				actionLabel="Close picker"
				onAction={() => (pickingHost = null)}
				onSettings={() => {
					const host = pickingHost;
					pickingHost = null;
					if (host) openHostSettings(host);
				}}
			/>
		</div>
	{/if}

	{#if podcastState.errorMessage}
		<div class="podcast-error">
			<span>{podcastState.errorMessage}</span>
			<button type="button" onclick={() => (podcastState.errorMessage = '')}>×</button>
		</div>
	{/if}

	<!-- 	{#if podcastState.lastVoiceChunkIndex !== null}
		<div class="voice-chunk-log">
			{podcastState.lastVoiceChunkIndex >= 0
				? `Voice: #${podcastState.lastVoiceChunkIndex}`
				: 'Voice: default'}
		</div>
	{/if} -->
</div>

<VoiceSettingsModal
	show={settingsHost !== null}
	title={settingsHost === 'A' ? 'Host A synthesis settings' : 'Host B synthesis settings'}
	chunks={settingsChunks}
	audioFile={settingsAudioFile}
	randomChunk={settingsRandomChunk}
	synthParams={settingsSynth}
	pauseSettings={{ minGapMs: 0.4, maxGapMs: 1, betweenParagraphs: 1.5 }}
	showPauses={false}
	onChange={applyHostSettings}
	onClose={() => (settingsHost = null)}
	onChunksChanged={() => {
		const id =
			settingsHost === 'A'
				? podcastState.config.hostAProfileId
				: podcastState.config.hostBProfileId;
		void podcastState.refreshChunks(id);
	}}
/>

<style>
	.podcast-mode {
		display: flex;
		flex-direction: column;
		position: fixed;
		inset: 0;
		overflow: hidden;
		background: rgba(14, 14, 14, 0.99);
		z-index: 1100;
		font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
	}

	.podcast-mode--mini {
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
		width: 340px;
		height: 70px;
		display: flex;
		align-items: center;
		pointer-events: auto;
	}

	.podcast-mode--mini.podcast-mode--picking {
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
	}

	.podcast-mini-bar {
		display: flex;
		align-items: center;
		width: 100%;
		height: 100%;
		gap: 0.25rem;
	}

	.podcast-mini-bar__expand,
	.podcast-mini-bar__exit {
		all: unset;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 30px;
		height: 30px;
		border-radius: var(--radius-md);
		color: rgba(255, 255, 255, 0.5);
		background: rgba(154, 154, 154, 0.12);
		border: 1px solid rgba(255, 255, 255, 0.1);
		transition: background 0.2s ease;
	}

	.podcast-mini-bar__expand:hover,
	.podcast-mini-bar__exit:hover {
		background: rgba(255, 255, 255, 0.12);
		color: white;
	}

	.podcast-body {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 0;
	}

	.podcast-body.flex-1 {
		flex: 1;
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
		min-width: 200px;
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 200px;
		justify-content: flex-end;
	}

	.podcast-speakers {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1.5rem;
		padding: 0.5rem 0;
		flex-shrink: 0;
	}

	.podcast-host {
		all: unset;
		cursor: pointer;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.4rem;
		transition: opacity 0.25s ease;
	}

	.podcast-host:hover {
		opacity: 0.85;
	}

	.podcast-host.dimmed {
		opacity: 0.4;
	}

	.podcast-host__avatar-wrap {
		width: 100px;
		height: 100px;
		border-radius: 999px;
		overflow: hidden;
		transition: box-shadow 240ms ease;
	}

	.podcast-host:hover .podcast-host__avatar-wrap {
		box-shadow: 0 0 0 2px var(--primary-color);
	}

	.podcast-host__avatar {
		width: 100%;
		height: 100%;
		object-fit: cover;
		border: 1px solid rgba(255, 255, 255, 0.1);
		box-sizing: border-box;
	}

	.podcast-host__avatar.fallback {
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		font-weight: bold;
		font-size: 1.5rem;
		user-select: none;
	}

	.podcast-host__name {
		font-size: 0.8rem;
		font-weight: 600;
		color: white;
		max-width: 120px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.podcast-picker-overlay {
		position: absolute;
		bottom: 2rem;
		left: 50%;
		transform: translateX(-50%);
		width: min(720px, 90vw);
		padding: 1rem 1.25rem;
		background: rgba(9, 9, 9, 0.96);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: var(--radius-lg);
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
		z-index: 10;
	}

	.status-label {
		color: rgba(255, 255, 255, 0.5);
		font-size: 0.8rem;
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

	.vs-separator {
		font-size: 0.7rem;
		color: rgba(255, 255, 255, 0.25);
		font-weight: bold;
		letter-spacing: 0.1em;
	}

	.current-topic-bar {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		padding: 0.5rem 1.5rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
		/* background: rgba(255, 255, 255, 0.02); */
		flex-shrink: 0;
	}

	.topic-index {
		font-size: 0.65rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--primary-color);
		font-weight: 600;
	}

	.topic-text {
		font-size: 0.95rem;
		color: rgba(255, 255, 255, 0.85);
		font-weight: 500;
		line-height: 1.3;
	}

	.podcast-stage {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 0;
		gap: 1rem;
	}

	.podcast-canvas-container {
		width: 90%;
		height: 140px;
		flex-shrink: 0;
		position: relative;
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
		border-radius: var(--radius-md);
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

	.podcast-controls {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1.75rem;
		padding: 1rem 2rem;
		flex-shrink: 0;
	}

	.control-btn {
		all: unset;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 50px;
		height: 50px;
		border-radius: 50%;
		color: var(--primary-color);
		transition:
			background 0.2s,
			transform 0.2s;
	}

	.control-btn:hover {
		background: rgba(255, 255, 255, 0.08);
	}

	.control-btn-main {
		width: 60px;
		height: 60px;
	}

	.podcast-error {
		position: absolute;
		bottom: 6rem;
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

	.voice-chunk-log {
		position: fixed;
		bottom: 1rem;
		right: 1rem;
		color: var(--primary-color);
		font-size: 0.7rem;
		pointer-events: none;
		opacity: 0.8;
		z-index: 1101;
	}
</style>
