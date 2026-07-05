<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { createHotkey } from '@tanstack/svelte-hotkeys';
	import { ttsState, type TTSConfig } from '@/stores/ttsStore.svelte';
	import { drawersState, viewState } from '@/stores/viewStore.svelte';
	import {
		fetchVoiceProfiles,
		fetchVoiceChunks,
		deleteVoiceChunk,
		deleteVoiceProfile,
		updateVoiceProfile,
		getImage,
		type Voice,
		type VoiceProfile
	} from '@/lib/utils/ttsService';
	import Button from '../inputs/Button.component.svelte';
	import Dropdown from '../inputs/Dropdown.component.svelte';
	import Input from '../inputs/Input.component.svelte';
	import LoadingLine from '@/components/LoadingLine.svelte';
	import RangeSelector from '../inputs/RangeSelector.svelte';
	import Spacer from '@/components/Spacer.component.svelte';
	import Icon from '@/components/Icon.svelte';
	import ToggleIcon from '@/components/ToggleIcon.svelte';
	import HorizontalScroller from '@/components/HorizontalScroller.svelte';

	let profiles = $state<VoiceProfile[]>([]);
	let chunks = $state<Voice[]>([]);
	let hoveredVoiceName = $state<string | null>(null);

	let voicesLoading = $state(false);

	let selectedProfileId = $state('');

	let localSegment = $state(ttsState.segment);
	let localChunkCount = $state(ttsState.chunkCount);
	let localConfig = $state<TTSConfig>({ ...ttsState.config });
	let localLanguage = $state(viewState.language);

	let editNamePrefix = $state('');
	let editImageSrc = $state('');
	let editLoading = $state(false);

	$effect(() => {
		const profile = profiles.find((p) => p.id === selectedProfileId);
		if (profile) {
			editNamePrefix = profile.name_prefix;
			editImageSrc = profile.image_src ?? '';
		}
	});

	createHotkey(
		'D',
		async () => {
			if (!hoveredVoiceName) return;
			try {
				await deleteVoiceChunk(hoveredVoiceName);
				hoveredVoiceName = null;
				await reloadChunks();
			} catch (err) {
				ttsState.errorMessage = err instanceof Error ? err.message : 'Failed to delete voice chunk';
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
		try {
			profiles = await fetchVoiceProfiles();

			const match = profiles.find((p) => p.name_prefix === ttsState.namePrefix);
			if (match) {
				await selectProfile(match.id);
			} else if (profiles.length > 0) {
				await selectProfile(profiles[0].id);
			}
		} catch (err) {
			ttsState.errorMessage = err instanceof Error ? err.message : 'Failed to load voices';
		} finally {
			voicesLoading = false;
		}
	}

	async function loadChunksForProfile(profileId: string) {
		try {
			chunks = await fetchVoiceChunks(profileId);
			ttsState.setVoiceChunks(chunks);
		} catch (err) {
			ttsState.errorMessage = err instanceof Error ? err.message : 'Failed to load voice chunks';
		}
	}

	async function reloadChunks() {
		const profile = profiles.find((p) => p.id === selectedProfileId);
		if (profile) {
			await loadChunksForProfile(profile.id);
		}
	}

	async function selectProfile(id: string) {
		selectedProfileId = id;
		const profile = profiles.find((p) => p.id === id);
		if (!profile) return;
		ttsState.namePrefix = profile.name_prefix;
		if (profile.language) {
			localLanguage = profile.language as 'en' | 'es';
		}
		await loadChunksForProfile(profile.id);
		const firstChunk = chunks[0];
		if (firstChunk) {
			const audioFile = firstChunk.audio_file;
			const refText = firstChunk.text_reference;
			ttsState.config.refAudioFilename = audioFile;
			ttsState.config.refText = refText;
			localConfig.refAudioFilename = audioFile;
			localConfig.refText = refText;
		}
	}

	const scrollerItems = $derived(
		profiles.map((p) => ({
			id: p.id,
			label: p.name_prefix,
			imageSrc: p.image_src ? getImage(p.image_src) : null
		}))
	);

	async function handleNamePrefixChange(id: string) {
		await selectProfile(id);
	}

	function selectVoiceByIndex(index: number) {
		const voice = chunks[index];

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

	async function handleDeleteProfile() {
		const profile = profiles.find((p) => p.id === selectedProfileId);
		if (!profile) return;

		try {
			await deleteVoiceProfile(profile.id);
			profiles = profiles.filter((p) => p.id !== profile.id);
			chunks = [];
			selectedProfileId = '';
			if (profiles.length > 0) {
				await selectProfile(profiles[0].id);
			} else {
				ttsState.namePrefix = '';
			}
		} catch (err) {
			ttsState.errorMessage = err instanceof Error ? err.message : 'Failed to delete voice profile';
		}
	}

	async function handleAddVoice() {
		ttsState.segment = localSegment;
		ttsState.chunkCount = localChunkCount;
		drawersState.close('tts-settings');

		await ttsState.startAddVoice();
		if (ttsState.addVoiceStatus === 'done') {
			await loadProfiles();
		}
	}

	async function handleSaveProfile() {
		const profile = profiles.find((p) => p.id === selectedProfileId);
		if (!profile) return;
		const patch: { name_prefix?: string; image_src?: string } = {};
		const nextName = editNamePrefix.trim();
		if (nextName && nextName !== profile.name_prefix) patch.name_prefix = nextName;
		const nextImage = editImageSrc.trim();
		if (nextImage !== (profile.image_src ?? '')) patch.image_src = nextImage || undefined;
		if (Object.keys(patch).length === 0) return;

		editLoading = true;
		try {
			await updateVoiceProfile(profile.id, patch);
			await loadProfiles();
		} catch (err) {
			ttsState.errorMessage = err instanceof Error ? err.message : 'Failed to update voice profile';
		} finally {
			editLoading = false;
		}
	}
</script>

<div class="panel">
	<h2>
		<Icon name="AudioWaveform" size={30} color={viewState.primaryColor} />
		<span>TTS Settings</span>
	</h2>

	{#if voicesLoading}
		<p class="loading">Loading voices...</p>
	{/if}

	<Spacer title="voices" defaultOpen icon="Podcast">
		<div class="voice-selector">
			<HorizontalScroller
				items={scrollerItems}
				bind:selectedId={selectedProfileId}
				onSelect={handleNamePrefixChange}
			/>

			<div class="profile-row">
				<button
					type="button"
					class="delete-profile-btn"
					onclick={handleDeleteProfile}
					disabled={!selectedProfileId}
					aria-label="Delete voice profile"
					title="Delete voice profile"
				>
					<Icon name="Trash" />
				</button>

				<ToggleIcon name="Shuffle" bind:checked={localConfig.randomChunk} label="Random chunk" />
			</div>

			{#if !localConfig.randomChunk}
				<div class="voice-buttons">
					{#each chunks as voice, i (voice.name)}
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
			{/if}
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

	<Spacer title="edit Voice" icon="UserRoundPen">
		<Input id="editNamePrefix" label="Name Prefix" bind:value={editNamePrefix} />
		<div class="image-preview-row">
			{#if editImageSrc}
				<img class="image-preview" src={getImage(editImageSrc)} alt="profile preview" />
			{:else}
				<div class="image-preview image-preview-empty" />
			{/if}
			<Input
				id="editImageSrc"
				label="Image URL"
				bind:value={editImageSrc}
				placeholder="https://..."
			/>
		</div>

		<Spacer size={25} />

		<Button disabled={editLoading || !selectedProfileId} onClick={handleSaveProfile}>
			{editLoading ? 'Saving...' : 'Save Profile'}
		</Button>
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
			step={0.5}
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

		<Dropdown
			label="Chunk split level"
			options={[
				{ label: 'Coarse (paragraphs only)', value: '0' },
				{ label: 'Default (paragraphs + sentences)', value: '1' },
				{ label: 'Medium (+ clauses)', value: '2' },
				{ label: 'Fine (+ soft breaks)', value: '3' }
			]}
			value={String(localConfig.splitLevel)}
			onChange={(v) => (localConfig.splitLevel = Number(v) as 0 | 1 | 2 | 3)}
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
		padding: 3rem 1.5rem;
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

	.profile-row {
		display: flex;
		gap: 0.5rem;
		align-items: flex-end;
	}

	.delete-profile-btn {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		padding: 0;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
		background: rgba(154, 154, 154, 0.12);
		color: var(--primary-color);
		cursor: pointer;
		outline: none;
		transition: all 0.2s ease;
	}

	.delete-profile-btn:hover:not(:disabled) {
		background: rgba(255, 80, 80, 0.2);
		border-color: rgba(255, 80, 80, 0.4);
		color: #ff5050;
	}

	.delete-profile-btn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}
</style>
