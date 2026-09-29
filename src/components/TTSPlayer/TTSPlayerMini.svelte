<script lang="ts">
	import WaveformCanvas from './WaveformCanvas.svelte';
	import Icon from '@/components/Icon.svelte';
	import { ttsState } from '@/stores/ttsStore.svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import type { WaveStyleConfig } from '@/lib/ttsPlayerConfig';
	import type { WaveformDrawConfig } from '@/lib/canvasWaveform';
	import { fade, fly } from 'svelte/transition';

	interface Props {
		analyser: AnalyserNode | null;
		waveColor: string;
		drawConfig: WaveformDrawConfig;
		waveConfig: WaveStyleConfig;
		waitingForChunk: boolean;
		showControls: boolean;
		remainingLabel: string | null;
		onPrimary: () => void;
		onStop: () => void;
	}

	let {
		analyser,
		waveColor,
		drawConfig,
		waveConfig,
		waitingForChunk,
		showControls,
		remainingLabel,
		onPrimary,
		onStop
	}: Props = $props();
</script>

<div class="tts-player-mini__content" transition:fly={{ duration: 200, y: -200 }}>
	<div class="tts-player-mini__canvas-clip">
		<WaveformCanvas
			variant="mini"
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

		{#if showControls}
			<div class="tts-player-mini__controls" transition:fade={{ duration: 180 }}>
				<button
					type="button"
					class="tts-player-mini__btn"
					onclick={(e) => {
						e.stopPropagation();
						onPrimary();
					}}
					aria-label={ttsState.isPlaying ? 'Pause' : 'Play'}
				>
					<Icon
						name={ttsState.isPlaying ? 'Pause' : 'Play'}
						size={20}
						color={viewState.primaryColor}
					/>
				</button>

				<button
					type="button"
					class="tts-player-mini__btn tts-player-mini__btn--stop"
					onclick={(e) => {
						e.stopPropagation();
						onStop();
					}}
					aria-label="Stop"
				>
					<Icon name="Square" size={16} color={viewState.primaryColor} />
				</button>

				{#if remainingLabel}
					<span class="tts-player-mini__time">{remainingLabel}</span>
				{/if}
			</div>
		{/if}
	</div>
</div>

{#if ttsState.errorMessage}
	<div class="tts-player-mini__error">
		<span>{ttsState.errorMessage}</span>
		<button type="button" onclick={() => (ttsState.errorMessage = '')}>×</button>
	</div>
{/if}

<style>
	.tts-player-mini__content {
		display: flex;
		align-items: center;
		width: 100%;
		height: 100%;
		gap: 0;
		background: transparent;
	}

	.tts-player-mini__canvas-clip {
		flex: 1;
		height: 100%;
		position: relative;
		border-radius: 0;
		overflow: visible;
		background: transparent;
	}

	.tts-player-mini__controls {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		display: flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.2rem 0.45rem;
		border-radius: 999px;
		background: rgba(9, 9, 9, 0.62);
		backdrop-filter: blur(4px);
		-webkit-backdrop-filter: blur(4px);
	}

	.tts-player-mini__btn {
		all: unset;
		box-sizing: border-box;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		width: 30px;
		height: 30px;
		border-radius: 50%;
		color: var(--primary-color);
		transition: background 0.15s ease;
	}

	.tts-player-mini__btn:hover {
		background: rgba(255, 255, 255, 0.1);
	}

	.tts-player-mini__btn--stop {
		width: 26px;
		height: 26px;
	}

	.tts-player-mini__time {
		color: var(--primary-color);
		opacity: 0.85;
		font-size: 0.72rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		padding: 0 0.2rem;
	}

	.tts-player-mini__error {
		position: absolute;
		bottom: calc(100% + 0.5rem);
		left: 80%;
		transform: translateX(-50%);
		white-space: nowrap;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.25rem 0.75rem;
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
