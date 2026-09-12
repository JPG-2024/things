<script lang="ts">
	import Icon from '@/components/Icon.svelte';
	import { ttsState } from '@/stores/ttsStore.svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import { fade } from 'svelte/transition';

	interface Props {
		remainingLabel: string | null;
		onPrimary: () => void;
		onStop: () => void;
		onSettings: () => void;
	}

	let { remainingLabel, onPrimary, onStop, onSettings }: Props = $props();
</script>

<div class="tts-player__controls" transition:fade={{ duration: 200 }}>
	<button
		type="button"
		class="tts-player__btn"
		onclick={onPrimary}
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
		onclick={onStop}
		aria-label="Stop"
	>
		<Icon name="Square" size={30} color={viewState.primaryColor} />
	</button>

	<button
		type="button"
		class="tts-player__btn tts-player__btn--settings"
		onclick={onSettings}
		aria-label="TTS Settings"
	>
		<Icon name="SlidersHorizontal" size={30} color={viewState.primaryColor} />
	</button>

	{#if remainingLabel}
		<span class="tts-player__time">{remainingLabel}</span>
	{/if}
</div>

<style>
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

	.tts-player__time {
		color: var(--primary-color);
		opacity: 0.8;
		font-size: 1.2rem;
		font-weight: bold;
		font-variant-numeric: tabular-nums;
		padding: 0.25rem 0.5rem;
		border-radius: var(--radius-sm);
	}
</style>
