<script lang="ts">
	import { onMount } from 'svelte';
	import { ttsState } from '@/stores/ttsStore.svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import { fetchVoices, type Voice } from '@/lib/utils/ttsService';
	import Button from '../inputs/Button.component.svelte';
	import Dropdown from '../inputs/Dropdown.component.svelte';
	import Input from '../inputs/Input.component.svelte';
	import LoadingLine from '@/components/LoadingLine.svelte';
	import RangeSelector from '../inputs/RangeSelector.svelte';
	import Checkbox from '../inputs/Checkbox.component.svelte';
	import Spacer from '@/components/Spacer.component.svelte';

	let voices = $state<Voice[]>([]);
	let voicesLoading = $state(false);
	let voicesError = $state('');

	let selectedVoiceValue = $state('');
	let selectedNamePrefix = $state('');

	onMount(() => {
		loadVoices();
	});

	async function loadVoices() {
		voicesLoading = true;
		voicesError = '';
		try {
			voices = await fetchVoices();
			const match = voices.find((v) => v.audio_file === ttsState.config.refAudioFilename);
			if (match) {
				selectedVoiceValue = match.audio_file;
				selectedNamePrefix = match.name_prefix;
			}
		} catch (err) {
			voicesError = err instanceof Error ? err.message : 'Failed to load voices';
		} finally {
			voicesLoading = false;
		}
	}

	const namePrefixOptions = $derived(
		[...new Set(voices.map((v) => v.name_prefix))].map((p) => ({
			label: p,
			value: p
		}))
	);

	const voicesForPrefix = $derived(voices.filter((v) => v.name_prefix === selectedNamePrefix));

	function handleNamePrefixChange(prefix: string) {
		selectedNamePrefix = prefix;
	}

	function selectVoiceByIndex(index: number) {
		const voice = voicesForPrefix[index];

		if (!voice) return;
		selectedVoiceValue = voice.audio_file;
		handleVoiceChange(voice.audio_file);
	}

	function handleVoiceChange(audioFile: string) {
		const voice = voices.find((v) => v.audio_file === audioFile);
		if (!voice) return;

		ttsState.config.refAudioFilename = voice.audio_file;
		ttsState.config.refText = voice.text_reference;

		console.log(voice.audio_file, voice.text_reference);

		viewState.language = voice.language as 'en' | 'es';
	}

	async function handleAddVoice() {
		await ttsState.startAddVoice();
		if (ttsState.addVoiceStatus === 'done') {
			await loadVoices();
		}
	}
</script>

<div class="panel">
	<h2>TTS Settings</h2>

	{#if voicesError}
		<p class="error">{voicesError}</p>
	{/if}

	{#if voicesLoading}
		<p class="loading">Loading voices...</p>
	{/if}

	<Spacer title="Synthetize params" defaultOpen>
		<RangeSelector
			id="numStep"
			label="Num Steps"
			value={ttsState.config.numStep}
			min={1}
			max={64}
			step={1}
			format={(v) => v.toString()}
			onChange={(v) => (ttsState.config.numStep = v)}
		/>

		<RangeSelector
			id="guidanceScale"
			label="Guidance Scale"
			value={ttsState.config.guidanceScale}
			min={0}
			max={10}
			step={0.1}
			format={(v) => v.toFixed(1)}
			onChange={(v) => (ttsState.config.guidanceScale = v)}
		/>

		<RangeSelector
			id="speed"
			label="Speed"
			value={ttsState.config.speed}
			min={0.25}
			max={2}
			step={0.05}
			format={(v) => v.toFixed(2)}
			onChange={(v) => (ttsState.config.speed = v)}
		/>

		<!-- 		<RangeSelector
			id="tShift"
			label="T Shift"
			value={ttsState.config.tShift ?? 0}
			min={0}
			max={2}
			step={0.05}
			format={(v) => v.toFixed(2)}
			onChange={(v) => (ttsState.config.tShift = v)}
		/>

		<RangeSelector
			id="positionTemperature"
			label="Position Temperature"
			value={ttsState.config.positionTemperature ?? 0}
			min={0}
			max={2}
			step={0.05}
			format={(v) => v.toFixed(2)}
			onChange={(v) => (ttsState.config.positionTemperature = v)}
		/>

		<RangeSelector
			id="classTemperature"
			label="Class Temperature"
			value={ttsState.config.classTemperature ?? 0}
			min={0}
			max={2}
			step={0.05}
			format={(v) => v.toFixed(2)}
			onChange={(v) => (ttsState.config.classTemperature = v)}
		/>

		<RangeSelector
			id="layerPenaltyFactor"
			label="Layer Penalty Factor"
			value={ttsState.config.layerPenaltyFactor ?? 0}
			min={0}
			max={2}
			step={0.05}
			format={(v) => v.toFixed(2)}
			onChange={(v) => (ttsState.config.layerPenaltyFactor = v)}
		/>

		<RangeSelector
			id="duration"
			label="Duration"
			value={ttsState.config.duration ?? 0}
			min={0}
			max={60}
			step={1}
			format={(v) => `${v.toFixed(0)}s`}
			onChange={(v) => (ttsState.config.duration = v)}
		/>

		<RangeSelector
			id="audioChunkDuration"
			label="Audio Chunk Duration"
			value={ttsState.config.audioChunkDuration ?? 0}
			min={0}
			max={30}
			step={0.5}
			format={(v) => `${v.toFixed(1)}s`}
			onChange={(v) => (ttsState.config.audioChunkDuration = v)}
		/>

		<RangeSelector
			id="audioChunkThreshold"
			label="Audio Chunk Threshold"
			value={ttsState.config.audioChunkThreshold ?? 0}
			min={1.05}
			max={5}
			step={0.05}
			format={(v) => v.toFixed(2)}
			onChange={(v) => (ttsState.config.audioChunkThreshold = v)}
		/>

		<Checkbox
			id="denoise"
			label="Denoise"
			checked={ttsState.config.denoise}
			onChange={(v) => (ttsState.config.denoise = v)}
		/>

		<Checkbox
			id="preprocessPrompt"
			label="Preprocess Prompt"
			checked={ttsState.config.preprocessPrompt}
			onChange={(v) => (ttsState.config.preprocessPrompt = v)}
		/>

		<Checkbox
			id="postprocessOutput"
			label="Postprocess Output"
			checked={ttsState.config.postprocessOutput}
			onChange={(v) => (ttsState.config.postprocessOutput = v)}
		/> -->
	</Spacer>

	<Spacer size={25} />

	<Spacer title="Voices" defaultOpen>
		<div class="voice-selector">
			<Dropdown
				label="Voice"
				options={namePrefixOptions}
				bind:value={selectedNamePrefix}
				onChange={handleNamePrefixChange}
				placeholder="Select a voice..."
			/>

			<div class="voice-buttons">
				{#each voicesForPrefix as _, i}
					<Button label={`${i + 1}`} onClick={() => selectVoiceByIndex(i)} />
				{/each}
			</div>
		</div>

		<Input
			id="videoUrl"
			label="Video URL"
			bind:value={ttsState.videoUrl}
			placeholder="https://..."
		/>

		<div class="inline-grid">
			<Input id="segment" label="Segment" bind:value={ttsState.segment} />
			<Input id="namePrefix" label="Name Prefix" bind:value={ttsState.namePrefix} />
			<Input
				id="chunkCount"
				label="Chunk Count"
				type="number"
				min="1"
				bind:value={ttsState.chunkCount}
			/>
		</div>

		<Spacer size={25} />

		<Button
			label={ttsState.addVoiceLoading ? 'Processing...' : 'Add Voice'}
			disabled={ttsState.addVoiceLoading}
			onClick={handleAddVoice}
		/>

		<Spacer size={25} />

		<LoadingLine loading={ttsState.addVoiceLoading} />

		{#if ttsState.addVoiceStatus}
			<p
				class="status"
				class:error={ttsState.addVoiceStatus === 'error'}
				class:done={ttsState.addVoiceStatus === 'done'}
			>
				{ttsState.addVoiceStatus === 'done' ? '✓ ' : ''}{ttsState.addVoiceMessage ||
					ttsState.addVoiceStatus}
			</p>
		{/if}
	</Spacer>
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

	.inline-grid {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		gap: 1rem;
	}

	.voice-selector {
		display: flex;
		gap: 0.5rem;
		align-items: flex-end;
	}

	.voice-selector :global(.dropdown-input) {
		flex: 0 0 auto;
		width: auto;
		min-width: 150px;
	}

	.voice-buttons {
		display: flex;
		gap: 0.25rem;
		flex: 1;
	}

	.voice-buttons :global(.btn) {
		flex: 1;
		padding: 0.5rem 0.5rem;
		font-size: 1rem;
	}
</style>
