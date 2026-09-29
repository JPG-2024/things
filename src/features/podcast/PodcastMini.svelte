<script lang="ts">
	import { getImage, type VoiceProfile } from '@/lib/utils/ttsService';
	import { colorFor, initialFor } from '@/lib/utils/avatar';
	import { podcastState } from '@/features/podcast/podcastStore.svelte';
	import MiniProfilePicker from '@/components/TTSPlayer/MiniProfilePicker.svelte';
	import WaveformCanvas from '@/components/TTSPlayer/WaveformCanvas.svelte';
	import { getCurrentStyle } from '@/lib/ttsPlayerConfig';
	import type { WaveformDrawConfig } from '@/lib/canvasWaveform';
	import { fly } from 'svelte/transition';

	interface Props {
		pickingHost: 'A' | 'B' | null;
		onOpenPicker: (host: 'A' | 'B') => void;
		onClosePicker: () => void;
		onOpenHostSettings: () => void;
		onExpand: () => void;
	}

	let { pickingHost, onOpenPicker, onClosePicker, onOpenHostSettings, onExpand }: Props = $props();

	const config = getCurrentStyle();

	let filter = $state('');

	const hostAProfile = $derived(podcastState.hostAProfile);
	const hostBProfile = $derived(podcastState.hostBProfile);

	const selectedProfileId = $derived(
		pickingHost === 'A' ? podcastState.config.hostAProfileId : podcastState.config.hostBProfileId
	);

	const amplitudeScale = 1.7;
	const wavelengthScale = 300;

	const drawConfig: WaveformDrawConfig = {
		splineSampleStep: 0.4,
		amplitudeScale,
		maxWaveAmplitudePx: 120,
		wavelengthScale,
		sineFillAlpha: 0.24,
		strokeWidth: 8
	};

	const waveColor = `rgba(255, 255, 255, ${config.strokeAlpha})`;

	const isPlaying = $derived(podcastState.status === 'playing');
	const isPaused = $derived(podcastState.status === 'paused');
	const isGenerating = $derived(
		podcastState.status === 'generating' || podcastState.status === 'extracting'
	);

	function handlePick(profile: VoiceProfile) {
		if (pickingHost === 'A') {
			podcastState.config.hostAProfileId = profile.id;
			podcastState.config.hostAChunkFile = '';
			podcastState.config.hostARandomChunk = true;
		} else if (pickingHost === 'B') {
			podcastState.config.hostBProfileId = profile.id;
			podcastState.config.hostBChunkFile = '';
			podcastState.config.hostBRandomChunk = true;
		}
		onClosePicker();
	}

	$effect(() => {
		if (pickingHost) filter = '';
	});

	function getAnalyser(): AnalyserNode | null {
		return podcastState.getAnalyserNode();
	}
</script>

{#if pickingHost}
	<MiniProfilePicker
		bind:filter
		profiles={podcastState.profiles}
		{selectedProfileId}
		label={pickingHost === 'A' ? 'Host A' : 'Host B'}
		onPick={handlePick}
		actionIcon="X"
		actionLabel="Close picker"
		onAction={onClosePicker}
		onSettings={onOpenHostSettings}
	/>
{:else}
	<div class="podcast-mini__content" transition:fly={{ duration: 200, y: -200 }}>
		<button
			type="button"
			class="podcast-mini__host"
			onclick={(e) => {
				e.stopPropagation();
				onOpenPicker('A');
			}}
			aria-label={hostAProfile
				? `Change Host A voice. Currently ${hostAProfile.name_prefix}`
				: 'Choose Host A voice'}
		>
			<div
				class="podcast-mini__avatar-wrap"
				class:dimmed={podcastState.activeSpeaker !== null && podcastState.activeSpeaker !== 'A'}
			>
				{#if hostAProfile?.image_src}
					<img
						class="podcast-mini__avatar"
						src={getImage(hostAProfile.image_src)}
						alt={hostAProfile.name_prefix}
					/>
				{:else}
					<div
						class="podcast-mini__avatar fallback"
						style="background: {colorFor(hostAProfile?.id ?? '')}"
					>
						<span>{initialFor(hostAProfile?.name_prefix ?? 'A')}</span>
					</div>
				{/if}
			</div>
		</button>

		<div
			class="podcast-mini__canvas-clip"
			role="button"
			tabindex="0"
			aria-label="Expand to full podcast"
			onclick={onExpand}
			onkeydown={(e) => {
				if (e.key === 'Enter') onExpand();
			}}
		>
			<WaveformCanvas
				variant="mini"
				analyser={getAnalyser()}
				{isPlaying}
				{isPaused}
				{isGenerating}
				addVoiceLoading={false}
				waitingForChunk={false}
				chunksGenerated={0}
				color={waveColor}
				{drawConfig}
				waveConfig={config}
			/>
		</div>

		<button
			type="button"
			class="podcast-mini__host"
			onclick={(e) => {
				e.stopPropagation();
				onOpenPicker('B');
			}}
			aria-label={hostBProfile
				? `Change Host B voice. Currently ${hostBProfile.name_prefix}`
				: 'Choose Host B voice'}
		>
			<div
				class="podcast-mini__avatar-wrap"
				class:dimmed={podcastState.activeSpeaker !== null && podcastState.activeSpeaker !== 'B'}
			>
				{#if hostBProfile?.image_src}
					<img
						class="podcast-mini__avatar"
						src={getImage(hostBProfile.image_src)}
						alt={hostBProfile.name_prefix}
					/>
				{:else}
					<div
						class="podcast-mini__avatar fallback"
						style="background: {colorFor(hostBProfile?.id ?? '')}"
					>
						<span>{initialFor(hostBProfile?.name_prefix ?? 'B')}</span>
					</div>
				{/if}
			</div>
		</button>
	</div>
{/if}

<style>
	.podcast-mini__content {
		display: flex;
		align-items: center;
		width: 100%;
		height: 100%;
		gap: 0.5rem;
		background: transparent;
	}

	.podcast-mini__host {
		all: unset;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		transition: transform 0.2s ease;
	}

	.podcast-mini__host:hover {
		transform: scale(1.05);
	}

	.podcast-mini__host:focus-visible {
		outline: 2px solid var(--primary-color);
		outline-offset: 2px;
	}

	.podcast-mini__avatar-wrap {
		width: 48px;
		height: 48px;
		border-radius: 999px;
		overflow: hidden;
		flex-shrink: 0;
		transition: opacity 240ms ease;
		border: 2px solid rgba(255, 255, 255, 0.1);
	}

	.podcast-mini__avatar-wrap.dimmed {
		opacity: 0.4;
	}

	.podcast-mini__avatar {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.podcast-mini__avatar.fallback {
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		font-weight: bold;
		font-size: 1.2rem;
		user-select: none;
	}

	.podcast-mini__canvas-clip {
		flex: 1;
		height: 100%;
		position: relative;
		border-radius: 0;
		overflow: visible;
		background: transparent;
		cursor: pointer;
	}

	.podcast-mini__canvas-clip:focus-visible {
		outline: 2px solid var(--primary-color);
		outline-offset: 2px;
	}
</style>
