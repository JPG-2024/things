<script lang="ts">
	import { onDestroy } from "svelte";
	import Icon from "./Icon.svelte";
	import { ttsState } from "@/stores/ttsStore.svelte";
	import { generateSpeech } from "@/lib/utils/ttsService";

	type Props = {
		id: string;
		text: string;
		autoplay?: boolean;
		disabled?: boolean;
		instruct?: string;
	};

	let {
		id,
		text,
		autoplay = false,
		disabled = false,
		instruct,
	}: Props = $props();

	let audioElement = $state<HTMLAudioElement | null>(null);
	let lastAutoplayInputKey = $state("");
	let isGenerating = $state(false);
	let abortController: AbortController | null = null;

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

	async function handlePlay(signal?: AbortSignal) {
		if (disabled || ttsState.isLoading || isGenerating) {
			return;
		}

		if (signal?.aborted) {
			return;
		}

		isGenerating = true;
		ttsState.isLoading = true;
		ttsState.errorMessage = "";
		ttsState.activeId = id;

		if (ttsState.audioSrc) {
			URL.revokeObjectURL(ttsState.audioSrc);
			ttsState.audioSrc = null;
		}

		try {
			const res = await generateSpeech({
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
			});

			if (signal?.aborted) {
				return;
			}

			ttsState.durationSeconds = res.durationSeconds;

			if (res.blob.size === 0) {
				throw new Error("Generated audio is empty (0 bytes)");
			}

			console.debug("[TTS] Generated blob:", {
				size: res.blob.size,
				type: res.blob.type,
				duration: res.durationSeconds,
			});

			ttsState.audioSrc = URL.createObjectURL(res.blob);
		} catch (generationError) {
			if (signal?.aborted) {
				return;
			}
			ttsState.errorMessage =
				generationError instanceof Error
					? generationError.message
					: "Failed to generate TTS audio";
			console.error("[TTS] Generation error:", generationError);
		} finally {
			if (!signal?.aborted) {
				isGenerating = false;
				ttsState.isLoading = false;
			}
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

		abortController?.abort();
		abortController = new AbortController();
		handlePlay(abortController.signal);
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
		{:else if isGenerating}
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
		onerror={(e) => {
			const target = e.target as HTMLAudioElement;
			ttsState.errorMessage = `Playback error (${target.error?.code ?? "unknown"})`;
			ttsState.isPlaying = false;
			console.error("[TTS] Audio error:", target.error);
		}}
		onloadeddata={() => {
			console.debug("[TTS] Audio loaded, duration:", audioElement?.duration);
		}}
		oncanplay={() => {
			console.debug("[TTS] Audio can play");
		}}
		controls
		class="audio-bar"
		class:hidden={true}
	></audio>
</div>

{#if ttsState.errorMessage}
	<p class="error">{ttsState.errorMessage}</p>
{/if}

{#if isGenerating}
	<p class="debug">Generating...</p>
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

	.debug {
		margin: 0.35rem 0 0;
		color: #d2a8ff;
		font-size: 0.85rem;
	}
</style>
