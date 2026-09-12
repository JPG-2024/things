<script lang="ts">
	import VoiceSelector from '@/components/VoiceSelector.svelte';
	import WaveformCanvas from './WaveformCanvas.svelte';
	import TTSPlayerControls from './TTSPlayerControls.svelte';
	import { ttsState } from '@/stores/ttsStore.svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import type { Voice, VoiceProfile } from '@/lib/utils/ttsService';
	import type { WheelSelection } from '@/types/tts.types';
	import type { WaveStyleConfig } from '@/lib/ttsPlayerConfig';
	import type { WaveformDrawConfig } from '@/lib/canvasWaveform';

	interface Props {
		profiles: VoiceProfile[];
		chunks: Voice[];
		selection: WheelSelection;
		onVoiceChange: (selection: WheelSelection) => void;
		analyser: AnalyserNode | null;
		waveColor: string;
		drawConfig: WaveformDrawConfig;
		waveConfig: WaveStyleConfig;
		waitingForChunk: boolean;
		showControls: boolean;
		remainingLabel: string | null;
		onPrimary: () => void;
		onStop: () => void;
		onSettings: () => void;
	}

	let {
		profiles,
		chunks,
		selection,
		onVoiceChange,
		analyser,
		waveColor,
		drawConfig,
		waveConfig,
		waitingForChunk,
		showControls,
		remainingLabel,
		onPrimary,
		onStop,
		onSettings
	}: Props = $props();
</script>

<div class="tts-player__header">
	<VoiceSelector
		{profiles}
		{chunks}
		{selection}
		onChange={onVoiceChange}
		isActive={ttsState.isPlaying}
		activeColor={viewState.primaryColor}
	/>
</div>

<div class="tts-player__canvas-container">
	<WaveformCanvas
		variant="full"
		{analyser}
		isPlaying={ttsState.isPlaying}
		isPaused={ttsState.isPaused}
		isGenerating={ttsState.isGenerating}
		addVoiceLoading={ttsState.addVoiceLoading}
		{waitingForChunk}
		chunksGenerated={ttsState.chunksGenerated}
		color={waveColor}
		{drawConfig}
		{waveConfig}
	/>
</div>

{#if (ttsState.isPlaying || ttsState.isPaused) && showControls}
	<TTSPlayerControls {remainingLabel} {onPrimary} {onStop} {onSettings} />
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

<style>
	.tts-player__canvas-container {
		width: 100%;
		height: 20%;
		position: relative;
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
</style>
