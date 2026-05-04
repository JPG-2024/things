<script lang="ts">
import { onMount } from "svelte";
import { ttsState } from "@/stores/ttsStore.svelte";
import { viewState } from "@/stores/viewStore.svelte";
import { fetchVoices, type Voice } from "@/lib/utils/ttsService";
import Dropdown from "../inputs/Dropdown.component.svelte";

let voices = $state<Voice[]>([]);
let voicesLoading = $state(false);
let voicesError = $state("");

let selectedVoiceValue = $state("");

onMount(() => {
	loadVoices();
});

async function loadVoices() {
	voicesLoading = true;
	voicesError = "";
	try {
		voices = await fetchVoices();
		// Try to pre-select the voice that matches current config
		const match = voices.find(
			(v) => v.audio_file === ttsState.config.refAudioFilename
		);
		if (match) {
			selectedVoiceValue = match.audio_file;
		}
	} catch (err) {
		voicesError = err instanceof Error ? err.message : "Failed to load voices";
	} finally {
		voicesLoading = false;
	}
}

const voiceOptions = $derived(
	voices.map((v) => ({
		label: `${v.name} (${v.name_prefix})`,
		value: v.audio_file,
	}))
);

function handleVoiceChange(audioFile: string) {
	const voice = voices.find((v) => v.audio_file === audioFile);
	if (!voice) return;

	ttsState.config.refAudioFilename = voice.audio_file;
	ttsState.config.refText = voice.text_reference;
	viewState.language = voice.language as "en" | "es";
}
</script>

<div class="panel">
	<h2>TTS Settings</h2>

	{#if voicesError}
		<p class="error">{voicesError}</p>
	{/if}

	<div class="control-group">
		<label for="voice">Voice</label>
		{#if voicesLoading}
			<p class="loading">Loading voices...</p>
		{:else}
			<Dropdown
				id="voice"
				options={voiceOptions}
				bind:value={selectedVoiceValue}
				onChange={handleVoiceChange}
				placeholder="Select a voice..."
			/>
		{/if}
	</div>

	<div class="control-group">
		<label for="numStep">Num Steps: <span>{ttsState.config.numStep}</span></label>
		<input
			id="numStep"
			type="range"
			min="1"
			max="64"
			step="1"
			bind:value={ttsState.config.numStep}
		/>
	</div>

	<div class="control-group">
		<label for="guidanceScale">Guidance Scale: <span>{ttsState.config.guidanceScale.toFixed(1)}</span></label>
		<input
			id="guidanceScale"
			type="range"
			min="0"
			max="10"
			step="0.1"
			bind:value={ttsState.config.guidanceScale}
		/>
	</div>

	<div class="control-group">
		<label for="speed">Speed: <span>{ttsState.config.speed.toFixed(2)}</span></label>
		<input
			id="speed"
			type="range"
			min="0.25"
			max="2"
			step="0.05"
			bind:value={ttsState.config.speed}
		/>
	</div>

	<div class="control-group">
		<label for="tShift">T Shift: <span>{ttsState.config.tShift?.toFixed(2) ?? "—"}</span></label>
		<input
			id="tShift"
			type="range"
			min="0"
			max="2"
			step="0.05"
			bind:value={ttsState.config.tShift}
		/>
	</div>

	<div class="control-group">
		<label for="positionTemperature">Position Temperature: <span>{ttsState.config.positionTemperature?.toFixed(2) ?? "—"}</span></label>
		<input
			id="positionTemperature"
			type="range"
			min="0"
			max="2"
			step="0.05"
			bind:value={ttsState.config.positionTemperature}
		/>
	</div>

	<div class="control-group">
		<label for="classTemperature">Class Temperature: <span>{ttsState.config.classTemperature?.toFixed(2) ?? "—"}</span></label>
		<input
			id="classTemperature"
			type="range"
			min="0"
			max="2"
			step="0.05"
			bind:value={ttsState.config.classTemperature}
		/>
	</div>

	<div class="control-group">
		<label for="layerPenaltyFactor">Layer Penalty Factor: <span>{ttsState.config.layerPenaltyFactor?.toFixed(2) ?? "—"}</span></label>
		<input
			id="layerPenaltyFactor"
			type="range"
			min="0"
			max="2"
			step="0.05"
			bind:value={ttsState.config.layerPenaltyFactor}
		/>
	</div>

	<div class="control-group">
		<label for="duration">Duration: <span>{ttsState.config.duration?.toFixed(0) ?? "—"}s</span></label>
		<input
			id="duration"
			type="range"
			min="0"
			max="60"
			step="1"
			bind:value={ttsState.config.duration}
		/>
	</div>

	<div class="control-group">
		<label for="audioChunkDuration">Audio Chunk Duration: <span>{ttsState.config.audioChunkDuration?.toFixed(1) ?? "—"}s</span></label>
		<input
			id="audioChunkDuration"
			type="range"
			min="0"
			max="30"
			step="0.5"
			bind:value={ttsState.config.audioChunkDuration}
		/>
	</div>

	<div class="control-group">
		<label for="audioChunkThreshold">Audio Chunk Threshold: <span>{ttsState.config.audioChunkThreshold?.toFixed(2) ?? "—"}</span></label>
		<input
			id="audioChunkThreshold"
			type="range"
			min="1.05"
			max="5"
			step="0.05"
			bind:value={ttsState.config.audioChunkThreshold}
		/>
	</div>

	<div class="control-group checkbox">
		<label for="denoise">
			<input id="denoise" type="checkbox" bind:checked={ttsState.config.denoise} />
			Denoise
		</label>
	</div>

	<div class="control-group checkbox">
		<label for="preprocessPrompt">
			<input id="preprocessPrompt" type="checkbox" bind:checked={ttsState.config.preprocessPrompt} />
			Preprocess Prompt
		</label>
	</div>

	<div class="control-group checkbox">
		<label for="postprocessOutput">
			<input id="postprocessOutput" type="checkbox" bind:checked={ttsState.config.postprocessOutput} />
			Postprocess Output
		</label>
	</div>
</div>

<style>
	.panel {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1.5rem;
		border: 1px solid var(--primary-color, #ccc);
		border-radius: 8px;
		background-color: rgba(255, 255, 255, 0.02);
	}

	h2 {
		margin: 0 0 0.5rem 0;
		font-size: 1.1rem;
		color: var(--primary-color, #000);
	}

	.control-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.control-group.checkbox {
		flex-direction: row;
		align-items: center;
	}

	label {
		display: flex;
		justify-content: space-between;
		font-size: 0.9rem;
		color: inherit;
	}

	label span {
		font-weight: bold;
		color: var(--primary-color, #000);
	}

	input[type='range'],
	input[type='number'] {
		width: 100%;
		padding: 0.5rem;
		border: 1px solid var(--primary-color, #ccc);
		border-radius: 4px;
		font-size: 0.9rem;
	}

	input[type='checkbox'] {
		margin-right: 0.5rem;
		cursor: pointer;
	}

	.error {
		margin: 0;
		color: #ff7b72;
		font-size: 0.85rem;
	}

	.loading {
		margin: 0;
		font-size: 0.85rem;
		opacity: 0.7;
	}
</style>
