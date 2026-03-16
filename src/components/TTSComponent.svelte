<script lang="ts">
import { ttsStore } from "@/stores/ttsStore";
import Icon from "./Icon.svelte";

type Props = {
	id: string;
	text: string;
	autoplay?: boolean;
	disabled?: boolean;
};

let { id, text, autoplay = false, disabled = false }: Props = $props();

const ttsState = ttsStore.state;
let lastAutoplayInputKey = $state("");

function getInputKey() {
	return JSON.stringify([id, text]);
}

async function handlePlay() {
	if (disabled) {
		return;
	}

	try {
		await ttsStore.play({
			id,
			text,
		});
	} catch (playbackError) {
		console.error("Error playing TTS:", playbackError);
	}
}

async function handleStop() {
	if ($ttsState.activeId !== id) {
		return;
	}

	await ttsStore.stop();
}

$effect(() => {
	if (!autoplay) {
		lastAutoplayInputKey = "";
		return;
	}

	const trimmedText = text?.trim();
	if (!trimmedText) {
		return;
	}

	const nextInputKey = getInputKey();
	if (lastAutoplayInputKey === nextInputKey) {
		return;
	}

	lastAutoplayInputKey = nextInputKey;

	handlePlay();
});
</script>

<button
	type="button"
	class="tts-playback"
	onclick={$ttsState.activeId === id && $ttsState.isPlaying ? handleStop : handlePlay}
	disabled={disabled || $ttsState.isLoading}
	aria-label={$ttsState.activeId === id && $ttsState.isPlaying ? "Stop TTS playback" : "Play TTS audio"}
>
	
		{#if $ttsState.activeId === id && $ttsState.isLoading}
			<Icon name="Loader" size={12}/>
		{:else if $ttsState.activeId === id && $ttsState.isPlaying}
			<Icon name="Square" size={12}/>
		{:else}
			<Icon name="AudioLines" size={12} />
		{/if}
	
	<span class="time">
		{($ttsState.activeId === id
			? $ttsState.remainingSeconds || $ttsState.fullDurationSeconds
			: $ttsState.cachedDurationById[id]) || 0}s
	</span>
</button>

{#if $ttsState.activeId === id && $ttsState.errorMessage}
	<p class="error">{$ttsState.errorMessage}</p>
{/if}

<style>
    button{
		all: unset;
		box-sizing: border-box;
        cursor: pointer;
    }

	.tts-playback {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		
		border-radius: 4px;
		background: rgba(255, 255, 255, 0.06);
		padding: 0 8px;
		color: var(--primary-color);
		font-size: 0.75rem;
	}

	.tts-playback:disabled {
		opacity: 0.6;
	}
	.time {
		
		font-variant-numeric: tabular-nums;
	}

	.error {
		margin: 0.35rem 0 0;
		color: #ff7b72;
		font-size: 0.85rem;
	}
</style>
