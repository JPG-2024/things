<script lang="ts">
import { onMount } from "svelte";
import { ttsState } from "@/stores/ttsStore.svelte";
import { viewState } from "@/stores/viewStore.svelte";
import { fetchVoices, type Voice } from "@/lib/utils/ttsService";
import Button from "../inputs/Button.component.svelte";
import Dropdown from "../inputs/Dropdown.component.svelte";
import Input from "../inputs/Input.component.svelte";
import LoadingLine from "@/components/LoadingLine.svelte";
import RangeSelector from "../inputs/RangeSelector.svelte";
import Checkbox from "../inputs/Checkbox.component.svelte";

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

async function handleAddVoice() {
	await ttsState.startAddVoice();
	if (ttsState.addVoiceStatus === "done") {
		await loadVoices();
	}
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
		<RangeSelector
			id="numStep"
			label="Num Steps"
			value={ttsState.config.numStep}
			min={1}
			max={64}
			step={1}
			format={(v) => v.toString()}
		/>
	</div>

	<div class="control-group">
		<RangeSelector
			id="guidanceScale"
			label="Guidance Scale"
			value={ttsState.config.guidanceScale}
			min={0}
			max={10}
			step={0.1}
			format={(v) => v.toFixed(1)}
		/>
	</div>

	<div class="control-group">
		<RangeSelector
			id="speed"
			label="Speed"
			value={ttsState.config.speed}
			min={0.25}
			max={2}
			step={0.05}
			format={(v) => v.toFixed(2)}
		/>
	</div>

	<div class="control-group">
		<RangeSelector
			id="tShift"
			label="T Shift"
			value={ttsState.config.tShift ?? 0}
			min={0}
			max={2}
			step={0.05}
			format={(v) => v.toFixed(2)}
		/>
	</div>

	<div class="control-group">
		<RangeSelector
			id="positionTemperature"
			label="Position Temperature"
			value={ttsState.config.positionTemperature ?? 0}
			min={0}
			max={2}
			step={0.05}
			format={(v) => v.toFixed(2)}
		/>
	</div>

	<div class="control-group">
		<RangeSelector
			id="classTemperature"
			label="Class Temperature"
			value={ttsState.config.classTemperature ?? 0}
			min={0}
			max={2}
			step={0.05}
			format={(v) => v.toFixed(2)}
		/>
	</div>

	<div class="control-group">
		<RangeSelector
			id="layerPenaltyFactor"
			label="Layer Penalty Factor"
			value={ttsState.config.layerPenaltyFactor ?? 0}
			min={0}
			max={2}
			step={0.05}
			format={(v) => v.toFixed(2)}
		/>
	</div>

	<div class="control-group">
		<RangeSelector
			id="duration"
			label="Duration"
			value={ttsState.config.duration ?? 0}
			min={0}
			max={60}
			step={1}
			format={(v) => `${v.toFixed(0)}s`}
		/>
	</div>

	<div class="control-group">
		<RangeSelector
			id="audioChunkDuration"
			label="Audio Chunk Duration"
			value={ttsState.config.audioChunkDuration ?? 0}
			min={0}
			max={30}
			step={0.5}
			format={(v) => `${v.toFixed(1)}s`}
		/>
	</div>

	<div class="control-group">
		<RangeSelector
			id="audioChunkThreshold"
			label="Audio Chunk Threshold"
			value={ttsState.config.audioChunkThreshold ?? 0}
			min={1.05}
			max={5}
			step={0.05}
			format={(v) => v.toFixed(2)}
		/>
	</div>

	<div class="control-group">
		<Checkbox id="denoise" label="Denoise" checked={ttsState.config.denoise} />
	</div>

	<div class="control-group">
		<Checkbox id="preprocessPrompt" label="Preprocess Prompt" checked={ttsState.config.preprocessPrompt} />
	</div>

	<div class="control-group">
		<Checkbox id="postprocessOutput" label="Postprocess Output" checked={ttsState.config.postprocessOutput} />
	</div>

	<hr />

	<h2>Add Voice from Video</h2>

	<div class="control-group">
		<label for="videoUrl">Video URL</label>
		<Input id="videoUrl" bind:value={ttsState.videoUrl} placeholder="https://..." />
	</div>

	<div class="control-group">
		<label for="segment">Segment</label>
		<Input id="segment" bind:value={ttsState.segment} />
	</div>

	<div class="control-group">
		<label for="namePrefix">Name Prefix</label>
		<Input id="namePrefix" bind:value={ttsState.namePrefix} />
	</div>

	<div class="control-group">
		<label for="chunkCount">Chunk Count</label>
		<Input id="chunkCount" type="number" min="1" bind:value={ttsState.chunkCount} />
	</div>

	<Button
		label={ttsState.addVoiceLoading ? "Processing..." : "Add Voice"}
		disabled={ttsState.addVoiceLoading}
		onClick={handleAddVoice}
	/>
	<LoadingLine loading={ttsState.addVoiceLoading} />

	{#if ttsState.addVoiceStatus}
		<p class="status" class:error={ttsState.addVoiceStatus === "error"} class:done={ttsState.addVoiceStatus === "done"}>
			{ttsState.addVoiceStatus === "done" ? "✓ " : ""}{ttsState.addVoiceMessage || ttsState.addVoiceStatus}
		</p>
	{/if}

</div>

<style>
	.panel {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1.5rem;
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

	.done {
		color: #7dff7d;
	}

	.loading {
		margin: 0;
		font-size: 0.85rem;
		opacity: 0.7;
	}
</style>
