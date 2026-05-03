<script lang="ts">
	import { onDestroy } from "svelte";
	import Icon from "./Icon.svelte";
	import { ttsState } from "@/stores/ttsStore.svelte";

	type Props = {
		id: string;
		text: string;
		autoplay?: boolean;
		disabled?: boolean;
		instruct?: string;
	};

	let { id, text, autoplay = false, disabled = false, instruct }: Props = $props();

let audioElement = $state<HTMLAudioElement | null>(null);
let lastAutoplayInputKey = $state("");

function getInputKey() {
	return JSON.stringify([id, text]);
}

onDestroy(() => {
	if (ttsState.audioSrc) {
		URL.revokeObjectURL(ttsState.audioSrc);
	}
	if (ttsState.activeId === id) {
		ttsState.activeId = null;
	}
});

async function handlePlay() {
	if (disabled || ttsState.isLoading) {
		return;
	}

	ttsState.isLoading = true;
	ttsState.errorMessage = "";
	ttsState.activeId = id;

	if (ttsState.audioSrc) {
		URL.revokeObjectURL(ttsState.audioSrc);
		ttsState.audioSrc = null;
	}

	try {
		const response = await fetch(
			`${import.meta.env.VITE_TTS_API_URL}/tts/mp3`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					text,
					instruct,
					lang: ttsState.language,
					ref_audio: ttsState.config.refAudioFilename,
					ref_text: ttsState.config.refText,
					num_step: ttsState.config.numStep,
					denoise: ttsState.config.denoise,
					guidance_scale: ttsState.config.guidanceScale,
					t_shift: ttsState.config.tShift,
					position_temperature: ttsState.config.positionTemperature,
					class_temperature: ttsState.config.classTemperature,
					layer_penalty_factor: ttsState.config.layerPenaltyFactor,
					duration: ttsState.config.duration,
					speed: ttsState.config.speed,
					preprocess_prompt: ttsState.config.preprocessPrompt,
					postprocess_output: ttsState.config.postprocessOutput,
					audio_chunk_duration: ttsState.config.audioChunkDuration,
					audio_chunk_threshold: ttsState.config.audioChunkThreshold,
				}),
			}
		);

		if (!response.ok) {
			const err = await response.json().catch(() => ({}));
			const detail = (err as { detail?: unknown }).detail;
			const detailStr =
				detail == null
					? `Error ${response.status}`
					: typeof detail === "string"
						? detail
						: JSON.stringify(detail);
			throw new Error(detailStr);
		}

		const durationHeader = response.headers.get("X-Duration-Seconds");
		console.log("Duration header:", durationHeader);
		if (durationHeader) {
			ttsState.durationSeconds = Number.parseFloat(durationHeader);
		}

		const blob = await response.blob();
		ttsState.audioSrc = URL.createObjectURL(blob);
	} catch (playbackError) {
		ttsState.errorMessage =
			playbackError instanceof Error
				? playbackError.message
				: "Failed to generate TTS audio";
		console.error("Error playing TTS:", playbackError);
	} finally {
		ttsState.isLoading = false;
	}
}

function handleStop() {
	if (!audioElement) return;
	audioElement.pause();
	audioElement.currentTime = 0;
}

$effect(() => {
	if (ttsState.audioSrc && audioElement && ttsState.activeId === id) {
		audioElement.play().catch((err: unknown) => {
			if (err instanceof Error && err.name !== "AbortError") {
				ttsState.errorMessage = "Playback was blocked by the browser.";
			}
		});
	}
});

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

<div class="tts-wrapper">
	<button
		type="button"
		class="tts-playback"
		onclick={ttsState.isPlaying ? handleStop : handlePlay}
		disabled={disabled || ttsState.isLoading}
		aria-label={ttsState.isPlaying ? "Stop TTS playback" : "Play TTS audio"}
	>
		{#if ttsState.isLoading}
			<Icon name="Loader" size={18} />
		{:else if ttsState.isPlaying}
			<Icon name="Square" size={18} />
		{:else}
			<Icon name="AudioLines" size={18} />
		{/if}

		<span class="time">{ttsState.durationSeconds != null ? `${ttsState.durationSeconds.toFixed(1)}s` : "—"}</span>
	</button>

	<!-- svelte-ignore a11y_media_has_caption -->
 	<audio
		bind:this={audioElement}
		src={ttsState.audioSrc ?? undefined}
		onplay={() => { ttsState.isPlaying = true; }}
		onpause={() => { ttsState.isPlaying = false; }}
		onended={() => { ttsState.isPlaying = false; }}
		onerror={() => { ttsState.errorMessage = "Playback error"; ttsState.isPlaying = false; }}
		controls
		class="audio-bar"
		class:hidden={true}
	></audio>
</div>

{#if ttsState.errorMessage}
	<p class="error">{ttsState.errorMessage}</p>
{/if}

<style>
	.tts-wrapper {
		display: inline-flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	button {
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
		font-size: 0.80rem;
	}

	.tts-playback:disabled {
		opacity: 0.6;
	}

	.time {
		word-break: keep-all;
		font-variant-numeric: tabular-nums;
	}

	.audio-bar {
		width: 100%;
		height: 32px;
	}

	.hidden {
		display: none;
	}

	.error {
		margin: 0.35rem 0 0;
		color: #ff7b72;
		font-size: 0.85rem;
	}
</style>
