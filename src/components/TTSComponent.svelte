<script lang="ts">
import { onDestroy } from "svelte";
import Icon from "./Icon.svelte";

type Props = {
	id: string;
	text: string;
	autoplay?: boolean;
	disabled?: boolean;
	instruct?: string;
	refAudio?: string;
	refAudioFilename?: string;
	refText?: string;
	numStep?: number;
	guidanceScale?: number;
	tShift?: number;
	positionTemperature?: number;
	classTemperature?: number;
	layerPenaltyFactor?: number;
	duration?: number;
	speed?: number;
	denoise?: boolean;
	preprocessPrompt?: boolean;
	postprocessOutput?: boolean;
	audioChunkDuration?: number;
	audioChunkThreshold?: number;
};

let {
	id,
	text,
	autoplay = false,
	disabled = false,
	instruct,
	refAudio,
	//refAudioFilename = "jhernandez1.wav",
	//refText = "tenemos un monton de noticias mas no relacionadas solo con estos nuevos modelos, pero sobre todo lo que tenemos es dipsic dipsic la gran",
	//refAudioFilename = "freddy1.wav",
	//refText = "De hecho tim cooc es el ciio que ah creado mas valor corporatico en la historia de la humanidad hasta ahora.",
	//refAudioFilename = "midu1.wav",
	//refText = "ahora mismo aunque ah pasado una semana todavia no te puedes registrar a githab copilot en el plan pro pro plus ni estudiante",
	//refAudioFilename = "cam3.wav",
	//refText = "Ymmm nada hoy se la tengo que llevar porque se va de viaje y se la quiere llevar asique por un tiempito no voy a poder",
	//refAudioFilename = "cam4.wav",
	//refText = "Ah si boludo es una paja si no andas revisando te terminar cobrando un monton",
	refAudioFilename = "scarlet1.wav",
	refText = "any products that had any kind of oil in them and I think it wasnt I really was at that sort of breaking point of like this is something that i'm gonna have to deal for the rest of my life that I thought well",
	//refAudioFilename = "taylor1.wav",
	//refText = "I rather just spend like those hours doing something else or planning something fun for the fans for for the way we´re going to put out this album or baking or like I have a lot of hobbies",
	numStep = 16,
	guidanceScale = 2.0,
	tShift,
	positionTemperature,
	classTemperature,
	layerPenaltyFactor,
	duration,
	speed = 1.0,
	denoise = true,
	preprocessPrompt = true,
	postprocessOutput = true,
	audioChunkDuration,
	audioChunkThreshold,
}: Props = $props();

let isLoading = $state(false);
let isPlaying = $state(false);
let errorMessage = $state("");
let audioSrc = $state<string | null>(null);
let durationSeconds = $state<number | null>(null);
let audioElement = $state<HTMLAudioElement | null>(null);
let lastAutoplayInputKey = $state("");

function getInputKey() {
	return JSON.stringify([id, text]);
}

onDestroy(() => {
	if (audioSrc) {
		URL.revokeObjectURL(audioSrc);
	}
});

async function handlePlay() {
	if (disabled || isLoading) {
		return;
	}

	isLoading = true;
	errorMessage = "";

	if (audioSrc) {
		URL.revokeObjectURL(audioSrc);
		audioSrc = null;
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
					ref_audio: refAudio ?? refAudioFilename,
					ref_text: refText,
					num_step: numStep,
					denoise,
					guidance_scale: guidanceScale,
					t_shift: tShift,
					position_temperature: positionTemperature,
					class_temperature: classTemperature,
					layer_penalty_factor: layerPenaltyFactor,
					duration,
					speed,
					preprocess_prompt: preprocessPrompt,
					postprocess_output: postprocessOutput,
					audio_chunk_duration: audioChunkDuration,
					audio_chunk_threshold: audioChunkThreshold,
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
			durationSeconds = Number.parseFloat(durationHeader);
		}

		const blob = await response.blob();
		audioSrc = URL.createObjectURL(blob);
	} catch (playbackError) {
		errorMessage =
			playbackError instanceof Error
				? playbackError.message
				: "Failed to generate TTS audio";
		console.error("Error playing TTS:", playbackError);
	} finally {
		isLoading = false;
	}
}

function handleStop() {
	if (!audioElement) return;
	audioElement.pause();
	audioElement.currentTime = 0;
}

$effect(() => {
	if (audioSrc && audioElement) {
		audioElement.play().catch((err: unknown) => {
			if (err instanceof Error && err.name !== "AbortError") {
				errorMessage = "Playback was blocked by the browser.";
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
		onclick={isPlaying ? handleStop : handlePlay}
		disabled={disabled || isLoading}
		aria-label={isPlaying ? "Stop TTS playback" : "Play TTS audio"}
	>
		{#if isLoading}
			<Icon name="Loader" size={18} />
		{:else if isPlaying}
			<Icon name="Square" size={18} />
		{:else}
			<Icon name="AudioLines" size={18} />
		{/if}

		<span class="time">{durationSeconds != null ? `${durationSeconds.toFixed(1)}s` : "—"}</span>
	</button>

	<!-- svelte-ignore a11y_media_has_caption -->
 	<audio
		bind:this={audioElement}
		src={audioSrc ?? undefined}
		onplay={() => { isPlaying = true; }}
		onpause={() => { isPlaying = false; }}
		onended={() => { isPlaying = false; }}
		onerror={() => { errorMessage = "Playback error"; isPlaying = false; }}
		controls
		class="audio-bar"
		class:hidden={true}
	></audio>
</div>

{#if errorMessage}
	<p class="error">{errorMessage}</p>
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
