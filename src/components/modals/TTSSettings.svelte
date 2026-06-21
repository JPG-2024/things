<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { createHotkey } from '@tanstack/svelte-hotkeys';
	import { ttsState, type TTSConfig } from '@/stores/ttsStore.svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import {
		fetchVoiceProfiles,
		fetchVoiceChunks,
		deleteVoiceChunk,
		type Voice,
		type VoiceProfile
	} from '@/lib/utils/ttsService';
	import Button from '../inputs/Button.component.svelte';
	import Input from '../inputs/Input.component.svelte';
	import LoadingLine from '@/components/LoadingLine.svelte';
	import RangeSelector from '../inputs/RangeSelector.svelte';
	import Spacer from '@/components/Spacer.component.svelte';
	import IconDropdown from '../inputs/IconDropdown.component.svelte';
	import Icon from '@/components/Icon.svelte';

	let profiles = $state<VoiceProfile[]>([]);
	let chunks = $state<Voice[]>([]);
	let hoveredVoiceName = $state<string | null>(null);

	let voicesLoading = $state(false);
	let voicesError = $state('');

	let selectedNamePrefix = $state(ttsState.namePrefix);

	let localSegment = $state(ttsState.segment);
	let localChunkCount = $state(ttsState.chunkCount);
	let localConfig = $state<TTSConfig>({ ...ttsState.config });
	let localLanguage = $state(viewState.language);

	createHotkey(
		'D',
		async () => {
			if (!hoveredVoiceName) return;
			try {
				await deleteVoiceChunk(hoveredVoiceName);
				hoveredVoiceName = null;
				await reloadChunks();
			} catch (err) {
				voicesError = err instanceof Error ? err.message : 'Failed to delete voice chunk';
			}
		},
		() => ({
			enabled: hoveredVoiceName !== null,
			ignoreInputs: true,
			stopPropagation: true,
			preventDefault: true
		})
	);

	onMount(() => {
		loadProfiles();
	});

	onDestroy(() => {
		ttsState.segment = localSegment;
		ttsState.chunkCount = localChunkCount;
		ttsState.config = { ...localConfig };
		viewState.language = localLanguage;
	});

	async function loadProfiles() {
		voicesLoading = true;
		voicesError = '';
		try {
			profiles = await fetchVoiceProfiles();

			const match = profiles.find((p) => p.name_prefix === ttsState.namePrefix);
			if (match) {
				selectedNamePrefix = match.name_prefix;
				if (match.language) {
					localLanguage = match.language as 'en' | 'es';
				}
				await loadChunksForProfile(match.id);
			} else if (profiles.length > 0) {
				selectedNamePrefix = profiles[0].name_prefix;
				if (profiles[0].language) {
					localLanguage = profiles[0].language as 'en' | 'es';
				}
				await loadChunksForProfile(profiles[0].id);
			}
		} catch (err) {
			voicesError = err instanceof Error ? err.message : 'Failed to load voices';
		} finally {
			voicesLoading = false;
		}
	}

	async function loadChunksForProfile(profileId: string) {
		try {
			chunks = await fetchVoiceChunks(profileId);
		} catch (err) {
			voicesError = err instanceof Error ? err.message : 'Failed to load voice chunks';
		}
	}

	async function reloadChunks() {
		const profile = profiles.find((p) => p.name_prefix === selectedNamePrefix);
		if (profile) {
			await loadChunksForProfile(profile.id);
		}
	}

	const namePrefixOptions = $derived(
		profiles.map((p) => ({
			label: p.name_prefix,
			value: p.name_prefix,
			icon: p.image_src ?? ''
		}))
	);

	const voicesForPrefix = $derived(chunks);

	async function handleNamePrefixChange(prefix: string) {
		selectedNamePrefix = prefix;
		ttsState.namePrefix = prefix;
		const profile = profiles.find((p) => p.name_prefix === prefix);
		if (profile) {
			if (profile.language) {
				localLanguage = profile.language as 'en' | 'es';
			}
			await loadChunksForProfile(profile.id);
		}
	}

	function selectVoiceByIndex(index: number) {
		const voice = voicesForPrefix[index];

		if (!voice) return;
		handleVoiceChange(voice.audio_file);
	}

	function handleVoiceChange(audioFile: string) {
		const chunk = chunks.find((c) => c.audio_file === audioFile);
		if (!chunk) return;

		localConfig.refAudioFilename = chunk.audio_file;
		localConfig.refText = chunk.text_reference;

		console.log(chunk.audio_file, chunk.text_reference);
	}

	async function handleAddVoice() {
		ttsState.segment = localSegment;
		ttsState.chunkCount = localChunkCount;

		await ttsState.startAddVoice();
		if (ttsState.addVoiceStatus === 'done') {
			await loadProfiles();
		}
	}
</script>

<div class="panel">
	<h2>
		<Icon name="AudioWaveform" size={30} color={viewState.primaryColor} />
		<span>TTS Settings</span>
	</h2>

	{#if voicesError}
		<p class="error">{voicesError}</p>
	{/if}

	{#if voicesLoading}
		<p class="loading">Loading voices...</p>
	{/if}

	<Spacer title="voices" defaultOpen icon="Podcast">
		<div class="voice-selector">
			<IconDropdown
				options={namePrefixOptions}
				bind:value={selectedNamePrefix}
				placeholder="Select a voice chunk..."
				disabled={voicesForPrefix.length === 0}
				onChange={handleNamePrefixChange}
				iconSize={60}
			/>

			<div class="voice-buttons">
				{#each voicesForPrefix as voice, i (voice.name)}
					<Button onClick={() => selectVoiceByIndex(i)}>
						<div
							role="button"
							class="voice-button"
							tabindex={i}
							onmouseenter={() => (hoveredVoiceName = voice.name)}
						>
							{i + 1}
						</div>
					</Button>
				{/each}
			</div>
		</div>

		<Spacer size={25} />

		<Spacer title="add Voice" icon="UserRoundPlus">
			<Input
				id="videoUrl"
				label="Video URL"
				bind:value={ttsState.videoUrl}
				placeholder="https://..."
			/>
			<div class="image-preview-row">
				{#if ttsState.imageSrc}
					<img class="image-preview" src={ttsState.imageSrc} alt="voice preview" />
				{:else}
					<div class="image-preview image-preview-empty" />
				{/if}
				<Input
					id="imageSrc"
					label="Image URL"
					bind:value={ttsState.imageSrc}
					placeholder="https://..."
				/>
			</div>

			<div class="inline-grid">
				<Input id="segment" label="Segment" bind:value={localSegment} />
				<Input id="namePrefix" label="Name Prefix" bind:value={ttsState.namePrefix} />
				<Input
					id="chunkCount"
					label="Chunk Count"
					type="number"
					min="1"
					value={localChunkCount.toString()}
					onChange={(v) => (localChunkCount = parseInt(v) || 1)}
				/>
			</div>

			<Spacer size={25} />

			<Button disabled={ttsState.addVoiceLoading} onClick={handleAddVoice}>
				{ttsState.addVoiceLoading ? 'Processing...' : 'Add Voice'}
			</Button>

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
	</Spacer>

	<Spacer title="synthetize params" icon="SlidersHorizontal">
		<RangeSelector
			id="numStep"
			label="Num Steps"
			value={localConfig.numStep}
			min={1}
			max={64}
			step={1}
			format={(v) => v.toString()}
			onChange={(v) => (localConfig.numStep = v)}
		/>

		<RangeSelector
			id="guidanceScale"
			label="Guidance Scale"
			value={localConfig.guidanceScale}
			min={0}
			max={5}
			step={1}
			format={(v) => v.toFixed(1)}
			onChange={(v) => (localConfig.guidanceScale = v)}
		/>

		<RangeSelector
			id="speed"
			label="Speed"
			value={localConfig.speed}
			min={0.25}
			max={2}
			step={0.05}
			format={(v) => v.toFixed(2)}
			onChange={(v) => (localConfig.speed = v)}
		/>

		<!-- 		<RangeSelector
			id="tShift"
			label="T Shift"
			value={localConfig.tShift ?? 0}
			min={0}
			max={2}
			step={0.05}
			format={(v) => v.toFixed(2)}
			onChange={(v) => (localConfig.tShift = v)}
		/>

		<RangeSelector
			id="positionTemperature"
			label="Position Temperature"
			value={localConfig.positionTemperature ?? 0}
			min={0}
			max={2}
			step={0.05}
			format={(v) => v.toFixed(2)}
			onChange={(v) => (localConfig.positionTemperature = v)}
		/>

		<RangeSelector
			id="classTemperature"
			label="Class Temperature"
			value={localConfig.classTemperature ?? 0}
			min={0}
			max={2}
			step={0.05}
			format={(v) => v.toFixed(2)}
			onChange={(v) => (localConfig.classTemperature = v)}
		/>

		<RangeSelector
			id="layerPenaltyFactor"
			label="Layer Penalty Factor"
			value={localConfig.layerPenaltyFactor ?? 0}
			min={0}
			max={2}
			step={0.05}
			format={(v) => v.toFixed(2)}
			onChange={(v) => (localConfig.layerPenaltyFactor = v)}
		/>

		<RangeSelector
			id="duration"
			label="Duration"
			value={localConfig.duration ?? 0}
			min={0}
			max={60}
			step={1}
			format={(v) => `${v.toFixed(0)}s`}
			onChange={(v) => (localConfig.duration = v)}
		/>

		<RangeSelector
			id="audioChunkDuration"
			label="Audio Chunk Duration"
			value={localConfig.audioChunkDuration ?? 0}
			min={0}
			max={30}
			step={0.5}
			format={(v) => `${v.toFixed(1)}s`}
			onChange={(v) => (localConfig.audioChunkDuration = v)}
		/>

		<RangeSelector
			id="audioChunkThreshold"
			label="Audio Chunk Threshold"
			value={localConfig.audioChunkThreshold ?? 0}
			min={1.05}
			max={5}
			step={0.05}
			format={(v) => v.toFixed(2)}
			onChange={(v) => (localConfig.audioChunkThreshold = v)}
		/>

		<Checkbox
			id="denoise"
			label="Denoise"
			checked={localConfig.denoise}
			onChange={(v) => (localConfig.denoise = v)}
		/>

		<Checkbox
			id="preprocessPrompt"
			label="Preprocess Prompt"
			checked={localConfig.preprocessPrompt}
			onChange={(v) => (localConfig.preprocessPrompt = v)}
		/>

		<Checkbox
			id="postprocessOutput"
			label="Postprocess Output"
			checked={localConfig.postprocessOutput}
			onChange={(v) => (localConfig.postprocessOutput = v)}
		/> -->
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
		color: var(--primary-color);
		display: flex;
		gap: 1rem;
		align-items: center;
	}

	.inline-grid {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		gap: 1rem;
	}

	.voice-selector {
		display: flex;
		flex-direction: column;
		gap: 1rem;

		height: fit-content;
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

	.image-preview-row {
		display: flex;
		gap: 0.75rem;
		align-items: flex-end;
	}

	.image-preview {
		width: 40px;
		height: 40px;
		border-radius: 8px;
		object-fit: cover;
		flex-shrink: 0;
	}

	.image-preview-empty {
		background: rgba(154, 154, 154, 0.12);
		border: 1px solid rgba(255, 255, 255, 0.1);
	}
</style>
