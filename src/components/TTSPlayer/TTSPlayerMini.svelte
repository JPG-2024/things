<script lang="ts">
	import WaveformCanvas from './WaveformCanvas.svelte';
	import TTSMiniProfilePicker from './TTSMiniProfilePicker.svelte';
	import { ttsState } from '@/stores/ttsStore.svelte';
	import type { VoiceProfile } from '@/lib/utils/ttsService';
	import type { WaveStyleConfig } from '@/lib/ttsPlayerConfig';
	import type { WaveformDrawConfig } from '@/lib/canvasWaveform';
	import { fly } from 'svelte/transition';

	interface Props {
		showProfilePicker: boolean;
		filteredProfiles: VoiceProfile[];
		selectedProfileId: string;
		filter?: string;
		onPickProfile: (profile: VoiceProfile) => void;
		onExpand: () => void;
		analyser: AnalyserNode | null;
		waveColor: string;
		drawConfig: WaveformDrawConfig;
		waveConfig: WaveStyleConfig;
		waitingForChunk: boolean;
	}

	let {
		showProfilePicker,
		filteredProfiles,
		selectedProfileId,
		filter = $bindable(''),
		onPickProfile,
		onExpand,
		analyser,
		waveColor,
		drawConfig,
		waveConfig,
		waitingForChunk
	}: Props = $props();
</script>

{#if showProfilePicker}
	<TTSMiniProfilePicker
		bind:filter
		{filteredProfiles}
		{selectedProfileId}
		onPick={onPickProfile}
		{onExpand}
	/>
{:else}
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
		</div>
	</div>
{/if}

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
