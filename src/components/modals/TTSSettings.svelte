<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { ttsState, type TTSConfig } from '@/stores/ttsStore.svelte';
	import { drawersState, viewState } from '@/stores/viewStore.svelte';
	import {
		fetchVoiceProfiles,
		fetchVoiceChunks,
		deleteVoiceProfile,
		updateVoiceProfile,
		getImage,
		type Voice,
		type VoiceProfile
	} from '@/lib/utils/ttsService';
	import Button from '../inputs/Button.component.svelte';
	import Input from '../inputs/Input.component.svelte';
	import LoadingLine from '@/components/LoadingLine.svelte';
	import Spacer from '@/components/Spacer.component.svelte';
	import Icon from '@/components/Icon.svelte';
	import VoiceSelector from '@/components/VoiceSelector.svelte';
	import type { WheelSelection } from '@/components/modals/VoiceProfileWheel.svelte';

	let profiles = $state<VoiceProfile[]>([]);
	let chunks = $state<Voice[]>([]);

	let voicesLoading = $state(false);

	let selectedProfileId = $state('');

	let localSegment = $state(ttsState.segment);
	let localChunkCount = $state(ttsState.chunkCount);
	let localConfig = $state<TTSConfig>({ ...ttsState.config });
	let localLanguage = $state(viewState.language);

	let editNamePrefix = $state('');
	let editImageSrc = $state('');
	let editLoading = $state(false);

	let wheelInitial = $derived<WheelSelection>({
		profileId: selectedProfileId,
		audioFile: localConfig.refAudioFilename,
		randomChunk: localConfig.randomChunk,
		synthParams: {
			numStep: localConfig.numStep,
			guidanceScale: localConfig.guidanceScale,
			speed: localConfig.speed,
			splitLevel: localConfig.splitLevel
		},
		pauseSettings: { ...ttsState.pauseSettings }
	});

	$effect(() => {
		const profile = profiles.find((p) => p.id === selectedProfileId);
		if (profile) {
			editNamePrefix = profile.name_prefix;
			editImageSrc = profile.image_src ?? '';
		}
	});

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
				selectedProfileId = match.id;
				editNamePrefix = match.name_prefix;
				editImageSrc = match.image_src ?? '';
				if (match.language) {
					localLanguage = match.language as 'en' | 'es';
				}
				await loadChunksForProfile(match.id);
				const firstChunk = chunks[0];
				if (firstChunk) {
					localConfig.refAudioFilename = firstChunk.audio_file;
					localConfig.refText = firstChunk.text_reference;
				}
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

	async function handleWheelCommit(sel: WheelSelection) {
		await selectProfile(sel.profileId);

		localConfig.randomChunk = sel.randomChunk;
		ttsState.config.randomChunk = sel.randomChunk;
		localConfig.numStep = sel.synthParams.numStep;
		ttsState.config.numStep = sel.synthParams.numStep;
		localConfig.guidanceScale = sel.synthParams.guidanceScale;
		ttsState.config.guidanceScale = sel.synthParams.guidanceScale;
		localConfig.speed = sel.synthParams.speed;
		ttsState.config.speed = sel.synthParams.speed;
		localConfig.splitLevel = sel.synthParams.splitLevel;
		ttsState.config.splitLevel = sel.synthParams.splitLevel;

		ttsState.pauseSettings.minGapMs = sel.pauseSettings.minGapMs;
		ttsState.pauseSettings.maxGapMs = sel.pauseSettings.maxGapMs;
		ttsState.pauseSettings.betweenParagraphs = sel.pauseSettings.betweenParagraphs;

		if (sel.audioFile && sel.audioFile !== chunks[0]?.audio_file) {
			const picked = chunks.find((c) => c.audio_file === sel.audioFile);
			if (picked) {
				localConfig.refAudioFilename = picked.audio_file;
				localConfig.refText = picked.text_reference;
				ttsState.config.refAudioFilename = picked.audio_file;
				ttsState.config.refText = picked.text_reference;
			}
		}
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
			if (patch.name_prefix) {
				ttsState.namePrefix = patch.name_prefix;
			}
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
		<VoiceSelector
			{profiles}
			{chunks}
			selection={wheelInitial}
			onChange={handleWheelCommit}
			onChunksChanged={reloadChunks}
		/>
	</Spacer>

	<Spacer title="edit Voice" icon="UserRoundPen">
		<Input id="editNamePrefix" label="Name Prefix" bind:value={editNamePrefix} />
		<div class="image-preview-row">
			{#if editImageSrc}
				<img class="image-preview" src={getImage(editImageSrc)} alt="profile preview" />
			{:else}
				<div class="image-preview image-preview-empty"></div>
			{/if}
			<Input
				id="editImageSrc"
				label="Image URL"
				bind:value={editImageSrc}
				placeholder="https://..."
			/>
		</div>

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

		<Spacer size={25} />

		<div class="button-container">
			<Button disabled={editLoading || !selectedProfileId} onClick={handleSaveProfile}>
				{editLoading ? 'Saving...' : 'Save Profile'}
			</Button>
		</div>
	</Spacer>

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
				<div class="image-preview image-preview-empty"></div>
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

		<div class="button-container">
			<Button disabled={ttsState.addVoiceLoading} onClick={handleAddVoice}>
				{ttsState.addVoiceLoading ? 'Processing...' : 'Add Voice'}
			</Button>
		</div>

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

	.button-container {
		display: flex;
		gap: 2rem;
	}
</style>
