<script lang="ts">
	import { onDestroy } from 'svelte';
	import { createHotkey } from '@tanstack/svelte-hotkeys';
	import { fade, scale } from 'svelte/transition';
	import {
		deleteVoiceChunk,
		generateSpeech,
		getImage,
		type Voice,
		type VoiceProfile
	} from '@/lib/utils/ttsService';
	import { startSystemRecording, stopSystemRecording } from '@/lib/utils/systemAudioRecorder';
	import { playerStore } from '@/stores/playerStore.svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import { ttsState } from '@/stores/ttsStore.svelte';
	import Icon from '@/components/Icon.svelte';
	import Button from '@/components/inputs/Button.component.svelte';
	import Dropdown from '@/components/inputs/Dropdown.component.svelte';
	import Input from '@/components/inputs/Input.component.svelte';
	import LoadingLine from '@/components/LoadingLine.svelte';
	import RangeSelector from '@/components/inputs/RangeSelector.svelte';
	import ToggleIcon from '@/components/ToggleIcon.svelte';
	import Spacer from '@/components/Spacer.component.svelte';
	import MiniProfilePicker from '@/components/TTSPlayer/MiniProfilePicker.svelte';
	import type { PauseSettings, SynthParams } from '@/types/tts.types';

	interface SettingsValue {
		audioFile: string;
		randomChunk: boolean;
		synthParams: SynthParams;
		pauseSettings: PauseSettings;
		/** Committed instruct string; undefined when the section is hidden. */
		instruct?: string;
	}

	interface Props {
		show: boolean;
		title?: string;
		chunks: Voice[];
		audioFile: string;
		randomChunk: boolean;
		synthParams: SynthParams;
		pauseSettings: PauseSettings;
		showPauses?: boolean;
		/**
		 * Committed voice-design instruct string ('' = cloned voice). Only
		 * read when `showVoiceDesign` is true.
		 */
		instruct?: string;
		/** Enables the Voice design section (cloned voice vs instruct synthesis). */
		showVoiceDesign?: boolean;
		onChange: (value: SettingsValue) => void;
		onClose: () => void;
		onChunksChanged?: () => void;
		/** Enables voice management (Add/Edit/Record). TTS only. */
		management?: boolean;
		profiles?: VoiceProfile[];
		selectedProfileId?: string;
		/** Applies a voice-profile selection immediately; the modal stays open. */
		onSelectProfile?: (profileId: string) => void | Promise<void>;
		onAddVoice?: () => void | Promise<void>;
		onSaveProfile?: (profileId: string, name: string, image: string) => Promise<boolean>;
		onDeleteProfile?: (profileId: string) => Promise<boolean>;
		onSaveRecording?: (
			blob: Blob,
			opts: { namePrefix: string; imageSrc?: string }
		) => Promise<string | null>;
		onProfilesChanged?: () => void | Promise<void>;
	}

	let {
		show,
		title = 'Synthesis settings',
		chunks,
		audioFile,
		randomChunk,
		synthParams,
		pauseSettings,
		showPauses = true,
		instruct = '',
		showVoiceDesign = false,
		onChange,
		onClose,
		onChunksChanged,
		management = false,
		profiles = [],
		selectedProfileId = '',
		onSelectProfile,
		onAddVoice,
		onSaveProfile,
		onDeleteProfile,
		onSaveRecording,
		onProfilesChanged
	}: Props = $props();

	const SPLIT_OPTIONS = [
		{ label: 'Coarse (paragraphs only)', value: '0' },
		{ label: 'Default (paragraphs + sentences)', value: '1' },
		{ label: 'Medium (+ clauses)', value: '2' },
		{ label: 'Fine (+ soft breaks)', value: '3' }
	];

	const NEW_PROFILE_VALUE = '__new__';

	// Restricted instruct vocabulary accepted by the TTS container; anything
	// else is rejected, so the string is composed from these tokens only.
	const DESIGN_GENDERS = ['male', 'female'] as const;
	const DESIGN_AGES = ['child', 'teenager', 'young adult', 'middle-aged', 'elderly'] as const;
	const DESIGN_PITCHES = [
		'very low pitch',
		'low pitch',
		'moderate pitch',
		'high pitch',
		'very high pitch'
	] as const;

	const CLONE_MODE_VALUE = 'cloned';
	const DESIGN_MODE_VALUE = 'design';
	const VOICE_MODE_OPTIONS = [
		{ label: 'Cloned (reference audio)', value: CLONE_MODE_VALUE },
		{ label: 'Designed (instruct)', value: DESIGN_MODE_VALUE }
	];
	const DESIGN_NONE_VALUE = '';

	let draftAudioFile = $state('');
	let draftRandomChunk = $state(false);
	let draftSynthParams = $state<SynthParams>({
		numStep: 16,
		guidanceScale: 2.0,
		speed: 1.0,
		splitLevel: 1
	});
	let draftPauseSettings = $state<PauseSettings>({
		minGapMs: 0.4,
		maxGapMs: 1,
		betweenParagraphs: 1.5
	});
	let hoveredChunkName = $state<string | null>(null);
	let wasOpen = $state(false);

	// Voice design state (draft; committed through snapshot()/onChange).
	let draftInstructEnabled = $state(false);
	let draftGender = $state('');
	let draftAge = $state('');
	let draftPitch = $state('');
	let draftWhisper = $state(false);
	let testLoading = $state(false);
	let testUrl = $state('');
	let testError = $state('');
	let testAbort: AbortController | null = null;

	// Voice management state (moved from MiniProfilePicker).
	let manageView = $state<'buttons' | 'add' | 'edit' | 'record'>('buttons');
	let editTargetId = $state('');
	let editName = $state('');
	let editImage = $state('');
	let editSaving = $state(false);
	let isRecording = $state(false);
	let recordingBusy = $state(false);
	let recordingSeconds = $state(0);
	let recordedUrl = $state('');
	let recordedBlob = $state<Blob | null>(null);
	let recordingSaving = $state(false);
	let recordingSaved = $state(false);
	let saveTargetProfileId = $state(NEW_PROFILE_VALUE);
	let saveNamePrefix = $state('');
	let saveImageSrc = $state('');
	let profileFilter = $state('');

	function snapshot(): SettingsValue {
		return {
			audioFile: draftAudioFile,
			randomChunk: draftRandomChunk,
			synthParams: { ...draftSynthParams },
			pauseSettings: { ...draftPauseSettings },
			instruct: showVoiceDesign ? (draftInstructEnabled ? composeInstruct() : '') : undefined
		};
	}

	function applyAndClose() {
		onChange(snapshot());
		onClose();
	}

	async function handleClose() {
		if (isRecording) await stopRecording(true);
		revokeRecordedUrl();
		cleanupTestAudio();
		applyAndClose();
	}

	function composeInstruct(): string {
		return [draftGender, draftAge, draftPitch, draftWhisper ? 'whisper' : '']
			.filter(Boolean)
			.join(', ');
	}

	function handleVoiceModeChange(value: string) {
		const enabled = value === DESIGN_MODE_VALUE;
		if (enabled && !composeInstruct()) {
			// Sensible defaults so the design mode is immediately valid; the
			// user adjusts from here.
			draftGender = 'female';
			draftAge = 'young adult';
			draftPitch = 'moderate pitch';
		}
		draftInstructEnabled = enabled;
	}

	function designSampleText(): string {
		return viewState.language.toLowerCase().startsWith('es')
			? 'Hola, así suena esta voz diseñada.'
			: 'Hello, this is how the designed voice sounds.';
	}

	function revokeTestUrl() {
		if (testUrl) {
			URL.revokeObjectURL(testUrl);
			testUrl = '';
		}
		testError = '';
	}

	function cleanupTestAudio() {
		testAbort?.abort();
		testAbort = null;
		revokeTestUrl();
		testLoading = false;
	}

	async function testDesignVoice() {
		if (testLoading) return;
		const instructValue = composeInstruct();
		if (!instructValue) return;

		testAbort?.abort();
		const abort = new AbortController();
		testAbort = abort;
		testLoading = true;
		testError = '';
		revokeTestUrl();
		try {
			const res = await generateSpeech(
				{ text: designSampleText(), instruct: instructValue, speed: draftSynthParams.speed },
				abort.signal
			);
			if (res.blob.size === 0) {
				throw new Error('Generated audio is empty (0 bytes)');
			}
			testUrl = URL.createObjectURL(res.blob);
			await new Audio(testUrl).play().catch(() => {});
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') return;
			testError = err instanceof Error ? err.message : 'Failed to generate speech';
		} finally {
			if (testAbort === abort) {
				testAbort = null;
			}
			testLoading = false;
		}
	}

	$effect(() => {
		if (show && !wasOpen) {
			draftAudioFile = audioFile;
			draftRandomChunk = randomChunk;
			draftSynthParams = { ...synthParams };
			draftPauseSettings = { ...pauseSettings };
			hoveredChunkName = null;
			manageView = 'buttons';
			recordingSaved = false;
			profileFilter = '';
			const tokens = instruct ? instruct.split(',').map((t) => t.trim()) : [];
			draftInstructEnabled = tokens.length > 0;
			draftGender = tokens.find((t) => (DESIGN_GENDERS as readonly string[]).includes(t)) ?? '';
			draftAge = tokens.find((t) => (DESIGN_AGES as readonly string[]).includes(t)) ?? '';
			draftPitch = tokens.find((t) => (DESIGN_PITCHES as readonly string[]).includes(t)) ?? '';
			draftWhisper = tokens.includes('whisper');
		}
		wasOpen = show;
	});

	// Ensure an in-progress recording is discarded if the modal is closed from
	// the outside (the component stays mounted, so onDestroy alone is not enough).
	$effect(() => {
		if (!show) {
			if (isRecording) void stopRecording(true);
			revokeRecordedUrl();
			cleanupTestAudio();
		}
	});

	$effect(() => {
		if (!isRecording) return;
		const id = setInterval(() => {
			recordingSeconds += 1;
		}, 1000);
		return () => clearInterval(id);
	});

	$effect(() => {
		if (manageView !== 'record' && isRecording) {
			void stopRecording(true);
		}
	});

	$effect(() => {
		if (
			draftAudioFile &&
			chunks.length > 0 &&
			!chunks.some((c) => c.audio_file === draftAudioFile)
		) {
			draftAudioFile = chunks[0]?.audio_file ?? '';
		}
	});

	onDestroy(() => {
		hoveredChunkName = null;
		if (isRecording) void stopRecording(true);
		revokeRecordedUrl();
		cleanupTestAudio();
	});

	function pickChunk(index: number) {
		const voice = chunks[index];
		if (!voice) return;
		draftAudioFile = voice.audio_file;
	}

	async function deleteHoveredChunk() {
		if (!hoveredChunkName) return;
		const name = hoveredChunkName;
		try {
			await deleteVoiceChunk(name);
			hoveredChunkName = null;
			onChunksChanged?.();
		} catch (err) {
			ttsState.errorMessage = err instanceof Error ? err.message : 'Failed to delete voice chunk';
		}
	}

	function openAddPanel() {
		manageView = 'add';
	}

	function openEditPanel() {
		const profile = profiles.find((p) => p.id === selectedProfileId);
		if (!profile) return;
		editTargetId = profile.id;
		editName = profile.name_prefix;
		editImage = profile.image_src ?? '';
		manageView = 'edit';
	}

	function openRecordPanel() {
		saveTargetProfileId = NEW_PROFILE_VALUE;
		saveNamePrefix = '';
		saveImageSrc = '';
		recordingSaved = false;
		revokeRecordedUrl();
		recordedBlob = null;
		manageView = 'record';
	}

	function backToManageButtons() {
		manageView = 'buttons';
	}

	function addVoiceStatusLabel(): string {
		if (ttsState.addVoiceMessage) return ttsState.addVoiceMessage;
		switch (ttsState.addVoiceStatus) {
			case 'downloading':
				return 'Downloading audio…';
			case 'transcribing':
				return 'Transcribing…';
			case 'chunking':
				return 'Creating chunks…';
			case 'done':
				return 'Voice added';
			case 'error':
				return 'Add voice failed';
			default:
				return '';
		}
	}

	async function handleAddVoice() {
		await onAddVoice?.();
		if (ttsState.addVoiceStatus === 'done') {
			await onProfilesChanged?.();
		}
	}

	async function handleSaveProfile() {
		if (!editTargetId || editSaving) return;
		editSaving = true;
		try {
			const ok = await onSaveProfile?.(editTargetId, editName, editImage);
			if (ok !== false) {
				backToManageButtons();
				await onProfilesChanged?.();
			}
		} finally {
			editSaving = false;
		}
	}

	async function handleDeleteProfile() {
		if (!editTargetId || editSaving) return;
		editSaving = true;
		try {
			const ok = await onDeleteProfile?.(editTargetId);
			if (ok !== false) {
				backToManageButtons();
				await onProfilesChanged?.();
			}
		} finally {
			editSaving = false;
		}
	}

	function formatDuration(totalSeconds: number): string {
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		return `${minutes}:${seconds.toString().padStart(2, '0')}`;
	}

	function revokeRecordedUrl() {
		if (recordedUrl) {
			URL.revokeObjectURL(recordedUrl);
			recordedUrl = '';
		}
	}

	async function startRecording() {
		if (isRecording || recordingBusy) return;
		recordingBusy = true;
		try {
			await startSystemRecording();
			isRecording = true;
			recordingSeconds = 0;
			revokeRecordedUrl();
			recordedBlob = null;
			recordingSaved = false;
		} catch {
			// error already surfaced through ttsState.errorMessage
		} finally {
			recordingBusy = false;
		}
	}

	async function stopRecording(discard = false) {
		if (!isRecording || recordingBusy) return;
		recordingBusy = true;
		isRecording = false;
		try {
			const blob = await stopSystemRecording();
			if (!discard) {
				revokeRecordedUrl();
				recordedUrl = URL.createObjectURL(blob);
				recordedBlob = blob;
				recordingSaved = false;
			}
		} catch {
			// error already surfaced through ttsState.errorMessage
		} finally {
			recordingBusy = false;
		}
	}

	function toggleRecording() {
		if (isRecording) {
			void stopRecording();
		} else {
			void startRecording();
		}
	}

	async function exitRecordPanel() {
		if (isRecording) await stopRecording();
		manageView = 'buttons';
	}

	async function handleSaveRecording() {
		if (recordingSaving || !recordedBlob) return;
		const target =
			saveTargetProfileId === NEW_PROFILE_VALUE
				? undefined
				: profiles.find((p) => p.id === saveTargetProfileId);
		const namePrefix = target ? target.name_prefix : saveNamePrefix.trim();
		if (!namePrefix) return;

		recordingSaving = true;
		try {
			const savedId = await onSaveRecording?.(recordedBlob, {
				namePrefix,
				imageSrc: target ? undefined : saveImageSrc.trim() || undefined
			});
			if (savedId) {
				recordingSaved = true;
				await onProfilesChanged?.();
				manageView = 'buttons';
			}
		} finally {
			recordingSaving = false;
		}
	}

	createHotkey(
		'D',
		async () => {
			await deleteHoveredChunk();
		},
		() => ({
			enabled: show && hoveredChunkName !== null && !draftRandomChunk && chunks.length > 0,
			ignoreInputs: true,
			stopPropagation: true,
			preventDefault: true
		})
	);

	createHotkey(
		'Escape',
		() => {
			if (manageView === 'record') {
				void exitRecordPanel();
			} else if (manageView !== 'buttons') {
				backToManageButtons();
			} else if (hoveredChunkName) {
				hoveredChunkName = null;
			} else {
				void handleClose();
			}
		},
		() => ({
			enabled: show,
			stopPropagation: true,
			preventDefault: true
		})
	);

	createHotkey('Shift+R', toggleRecording, () => ({
		enabled: show && management && manageView === 'record',
		ignoreInputs: true,
		preventDefault: true
	}));
</script>

{#if show}
	<div
		class="settings-backdrop"
		role="presentation"
		onclick={(e) => {
			// Only a direct backdrop click closes; clicks inside the dialog
			// target its children instead of the backdrop.
			if (e.target === e.currentTarget) void handleClose();
		}}
		transition:fade={{ duration: 180 }}
	>
		<div
			class="settings-modal"
			role="dialog"
			aria-label={title}
			tabindex="-1"
			transition:scale={{ start: 0.85, duration: 180 }}
		>
			<button class="close-btn" type="button" aria-label="Close settings" onclick={handleClose}>
				×
			</button>

			<h2>
				<Icon name="AudioWaveform" size={30} color={viewState.primaryColor} />
				{title}
			</h2>

			<div class="config-column">
				<Spacer title="TTS" icon="SlidersHorizontal" defaultOpen={true}>
					<div class="tts-sections">
						{#if management}
							<h3 class="tts-section-title">Voice</h3>
							{#if manageView === 'buttons'}
								{#if profiles.length > 0}
									<MiniProfilePicker
										variant="inline"
										bind:filter={profileFilter}
										{profiles}
										{selectedProfileId}
										onPick={(profile) => void onSelectProfile?.(profile.id)}
									/>
								{:else}
									<p class="voice-hint">No voices yet. Add or record one below.</p>
								{/if}
								<div class="voice-manage">
									<Button icon="Mic" onClick={openRecordPanel}>Record</Button>
									<Button icon="UserRoundPlus" onClick={openAddPanel}>Add voice</Button>
									<Button icon="UserRoundPen" disabled={!selectedProfileId} onClick={openEditPanel}
										>Edit voice</Button
									>
								</div>
							{:else if manageView === 'add'}
								<div class="voice-form">
									<div class="voice-form-header">
										<h3>
											<Icon name="UserRoundPlus" size={18} color={viewState.primaryColor} />
											<span>Add voice</span>
										</h3>
										<button
											class="voice-back"
											type="button"
											aria-label="Back"
											onclick={backToManageButtons}
										>
											×
										</button>
									</div>
									<Input
										id="settingsVideoUrl"
										label="Video URL"
										bind:value={ttsState.videoUrl}
										placeholder="https://..."
									/>
									<div class="voice-image-row">
										{#if ttsState.imageSrc}
											<img class="voice-image" src={ttsState.imageSrc} alt="voice preview" />
										{:else}
											<div class="voice-image voice-image--empty"></div>
										{/if}
										<Input
											id="settingsImageSrc"
											label="Image URL"
											bind:value={ttsState.imageSrc}
											placeholder="https://..."
										/>
									</div>
									<div class="voice-grid-2">
										<Input id="settingsSegment" label="Segment" bind:value={ttsState.segment} />
										<Input
											id="settingsChunkCount"
											label="Chunk Count"
											type="number"
											min="1"
											value={String(ttsState.chunkCount)}
											onChange={(v) => (ttsState.chunkCount = parseInt(v) || 1)}
										/>
									</div>
									<Input
										id="settingsNamePrefix"
										label="Name Prefix"
										bind:value={ttsState.namePrefix}
									/>
									<div class="voice-form-actions">
										<Button disabled={ttsState.addVoiceLoading} onClick={handleAddVoice}>
											{ttsState.addVoiceLoading ? 'Processing...' : 'Add Voice'}
										</Button>
									</div>
									<LoadingLine loading={ttsState.addVoiceLoading} />
									{#if ttsState.addVoiceStatus}
										<p
											class="voice-status"
											class:error={ttsState.addVoiceStatus === 'error'}
											class:done={ttsState.addVoiceStatus === 'done'}
										>
											{ttsState.addVoiceStatus === 'done' ? '✓ ' : ''}{addVoiceStatusLabel()}
										</p>
									{/if}
								</div>
							{:else if manageView === 'edit'}
								<div class="voice-form">
									<div class="voice-form-header">
										<h3>
											<Icon name="UserRoundPen" size={18} color={viewState.primaryColor} />
											<span>Edit voice</span>
										</h3>
										<button
											class="voice-back"
											type="button"
											aria-label="Back"
											onclick={backToManageButtons}
										>
											×
										</button>
									</div>
									<Input id="settingsEditName" label="Name Prefix" bind:value={editName} />
									<div class="voice-image-row">
										{#if editImage}
											<img class="voice-image" src={getImage(editImage)} alt="profile preview" />
										{:else}
											<div class="voice-image voice-image--empty"></div>
										{/if}
										<Input
											id="settingsEditImage"
											label="Image URL"
											bind:value={editImage}
											placeholder="https://..."
										/>
									</div>
									<div class="voice-form-actions">
										<Button disabled={editSaving || !editTargetId} onClick={handleSaveProfile}>
											{editSaving ? 'Saving...' : 'Save Profile'}
										</Button>
										<button
											type="button"
											class="voice-delete"
											onclick={handleDeleteProfile}
											disabled={editSaving || !editTargetId}
											aria-label="Delete voice profile"
											title="Delete voice profile"
										>
											<Icon name="Trash" />
										</button>
									</div>
								</div>
							{:else if manageView === 'record'}
								<div class="voice-form">
									<div class="voice-form-header">
										<h3>
											<Icon name="Mic" size={18} color={viewState.primaryColor} />
											<span>Record system audio</span>
										</h3>
										<button
											class="voice-back"
											type="button"
											aria-label="Back"
											onclick={() => void exitRecordPanel()}
										>
											×
										</button>
									</div>
									<p class="voice-hint">
										Captures everything playing on your default output device. Anything this app
										plays while recording is captured too.
									</p>
									<div class="voice-record-row">
										<button
											type="button"
											class="voice-record-btn"
											class:active={isRecording}
											disabled={recordingBusy}
											onclick={toggleRecording}
											aria-label={isRecording ? 'Stop recording' : 'Start recording'}
										>
											<Icon
												name={isRecording ? 'Square' : 'Circle'}
												size={20}
												color={isRecording ? '#ff5050' : undefined}
											/>
											<span
												>{recordingBusy ? 'Please wait...' : isRecording ? 'Stop' : 'Record'}</span
											>
										</button>
										{#if isRecording}
											<span class="voice-record-indicator"></span>
											<span class="voice-record-timer">{formatDuration(recordingSeconds)}</span>
										{/if}
									</div>
									<p class="voice-hint">Press <kbd>Shift</kbd>+<kbd>R</kbd> to start / stop</p>
									{#if recordedUrl}
										<audio class="voice-record-preview" controls src={recordedUrl}></audio>
										<div class="voice-record-save">
											<Dropdown
												label="Save to profile"
												options={[
													{ label: 'New profile', value: NEW_PROFILE_VALUE },
													...profiles.map((p) => ({ label: p.name_prefix, value: p.id }))
												]}
												value={saveTargetProfileId}
												onChange={(v) => (saveTargetProfileId = v)}
											/>
											{#if saveTargetProfileId === NEW_PROFILE_VALUE}
												<Input
													id="settingsRecordName"
													label="Name Prefix"
													bind:value={saveNamePrefix}
												/>
												<Input
													id="settingsRecordImage"
													label="Image URL (optional)"
													bind:value={saveImageSrc}
													placeholder="https://..."
												/>
											{/if}
											<div class="voice-form-actions">
												<Button
													disabled={recordingSaving ||
														(saveTargetProfileId === NEW_PROFILE_VALUE && !saveNamePrefix.trim())}
													onClick={handleSaveRecording}
												>
													{recordingSaving ? 'Saving...' : 'Save as voice'}
												</Button>
											</div>
											{#if recordingSaved}
												<p class="voice-status done">✓ Saved to voice profile</p>
											{/if}
										</div>
									{/if}
								</div>
							{/if}
						{/if}

						{#if showVoiceDesign}
							<h3 class="tts-section-title">Voice design</h3>
							<Dropdown
								label="Voice mode"
								options={VOICE_MODE_OPTIONS}
								value={draftInstructEnabled ? DESIGN_MODE_VALUE : CLONE_MODE_VALUE}
								onChange={handleVoiceModeChange}
							/>
							{#if draftInstructEnabled}
								<div class="voice-grid-2">
									<Dropdown
										label="Gender"
										options={[
											{ label: '—', value: DESIGN_NONE_VALUE },
											...DESIGN_GENDERS.map((g) => ({ label: g, value: g }))
										]}
										value={draftGender}
										onChange={(v) => (draftGender = v)}
									/>
									<Dropdown
										label="Age"
										options={[
											{ label: '—', value: DESIGN_NONE_VALUE },
											...DESIGN_AGES.map((a) => ({ label: a, value: a }))
										]}
										value={draftAge}
										onChange={(v) => (draftAge = v)}
									/>
								</div>
								<Dropdown
									label="Pitch"
									options={[
										{ label: '—', value: DESIGN_NONE_VALUE },
										...DESIGN_PITCHES.map((p) => ({ label: p, value: p }))
									]}
									value={draftPitch}
									onChange={(v) => (draftPitch = v)}
								/>
								<div class="row">
									<ToggleIcon name="Ear" bind:checked={draftWhisper} label="Whisper" />
								</div>
								<p class="hint">
									Instruct: {composeInstruct() || 'select at least one trait'}
								</p>
								<div class="voice-form-actions">
									<Button disabled={testLoading || !composeInstruct()} onClick={testDesignVoice}>
										{testLoading ? 'Generating…' : 'Test voice'}
									</Button>
								</div>
								{#if testError}
									<p class="voice-status error">{testError}</p>
								{/if}
								{#if testUrl}
									<audio class="voice-record-preview" controls src={testUrl}></audio>
								{/if}
							{/if}
						{/if}

						{#if !draftInstructEnabled}
							<h3 class="tts-section-title">Chunk</h3>
							<div class="row">
								<ToggleIcon name="Shuffle" bind:checked={draftRandomChunk} label="Random chunk" />
							</div>
							{#if !draftRandomChunk && chunks.length > 0}
								<div class="chunk-buttons">
									{#each chunks as voice, i (voice.name)}
										<button
											type="button"
											class="chunk-btn"
											class:selected={voice.audio_file === draftAudioFile}
											class:hovered={voice.name === hoveredChunkName}
											onclick={() => pickChunk(i)}
											onmouseenter={() => (hoveredChunkName = voice.name)}
											onmouseleave={() => (hoveredChunkName = null)}
											aria-label="Chunk {i + 1}"
										>
											{i + 1}
										</button>
									{/each}
								</div>
								{#if hoveredChunkName}
									<p class="hint">Press <kbd>D</kbd> to delete the hovered chunk</p>
								{/if}
							{/if}
						{/if}

						<h3 class="tts-section-title">Synthesis</h3>
						<div class="tts-grid-2">
							{#if !draftInstructEnabled}
								<RangeSelector
									id="settings-numStep"
									label="Num Steps"
									value={draftSynthParams.numStep}
									min={1}
									max={64}
									step={1}
									format={(v) => v.toString()}
									onChange={(v) => (draftSynthParams.numStep = v)}
								/>
								<RangeSelector
									id="settings-guidanceScale"
									label="Guidance Scale"
									value={draftSynthParams.guidanceScale}
									min={0}
									max={5}
									step={0.5}
									format={(v) => v.toFixed(1)}
									onChange={(v) => (draftSynthParams.guidanceScale = v)}
								/>
							{/if}
							<RangeSelector
								id="settings-speed"
								label="Speed"
								value={draftSynthParams.speed}
								min={0.25}
								max={2}
								step={0.05}
								format={(v) => v.toFixed(2)}
								onChange={(v) => (draftSynthParams.speed = v)}
							/>
							<Dropdown
								label="Chunk split level"
								options={SPLIT_OPTIONS}
								value={String(draftSynthParams.splitLevel)}
								onChange={(v) => (draftSynthParams.splitLevel = Number(v) as 0 | 1 | 2 | 3)}
							/>
						</div>
						{#if showPauses}
							<h3 class="tts-section-title">Pauses</h3>
							<div class="tts-grid-2">
								<RangeSelector
									id="settings-minGapMs"
									label="Min gap between sentences (s)"
									value={draftPauseSettings.minGapMs}
									min={0}
									max={1}
									step={0.01}
									format={(v) => v.toFixed(2)}
									onChange={(v) => (draftPauseSettings.minGapMs = v)}
								/>
								<RangeSelector
									id="settings-maxGapMs"
									label="Max gap between sentences (s)"
									value={draftPauseSettings.maxGapMs}
									min={0}
									max={1}
									step={0.01}
									format={(v) => v.toFixed(2)}
									onChange={(v) => (draftPauseSettings.maxGapMs = v)}
								/>
								<RangeSelector
									id="settings-betweenParagraphs"
									label="Pause between paragraphs (s)"
									value={draftPauseSettings.betweenParagraphs}
									min={0}
									max={2}
									step={0.01}
									format={(v) => v.toFixed(2)}
									onChange={(v) => (draftPauseSettings.betweenParagraphs = v)}
								/>
							</div>
						{/if}
					</div>
				</Spacer>

				{#if management}
					<Spacer title="Playback" icon="Volume2" defaultOpen={true}>
						<div class="tts-grid-2">
							<RangeSelector
								id="settings-prefetchDelay"
								label="Generation delay (s)"
								bind:value={ttsState.prefetchDelaySeconds}
								min={0}
								max={15}
								step={0.5}
								format={(v) => v.toFixed(1)}
							/>
							<RangeSelector
								id="settings-playerVolume"
								label="YouTube volume (%)"
								bind:value={playerStore.volume}
								min={0}
								max={100}
								step={1}
								format={(v) => v.toString()}
							/>
							<RangeSelector
								id="settings-duckVolume"
								label="YouTube volume while TTS (%)"
								bind:value={ttsState.volumeWhileTTS}
								min={0}
								max={30}
								step={1}
								format={(v) => v.toString()}
							/>
							<RangeSelector
								id="settings-volumeFade"
								label="Volume fade (ms)"
								bind:value={ttsState.volumeFadeMs}
								min={0}
								max={2000}
								step={50}
								format={(v) => v.toString()}
							/>
						</div>
						<div class="row">
							<ToggleIcon
								name="Minimize2"
								bind:checked={ttsState.autoMinimizeWhileTTS}
								label="Auto-minimize while TTS"
							/>
						</div>
					</Spacer>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.settings-backdrop {
		position: fixed;
		inset: 0;
		display: flex;
		justify-content: center;
		align-items: center;
		background: rgba(0, 0, 0);
		z-index: 100000;
	}

	.settings-modal {
		position: relative;
		width: 50vw;
		max-width: none;
		max-height: 92vh;
		overflow: hidden;
		background: #0e0e0e;

		padding: 2rem 0 0;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		color: white;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
	}

	h2 {
		font-family: var(--font-secondary);
		margin: 0 0 0.5rem 0;
		font-size: 1.1rem;
		color: var(--primary-color);
		display: flex;
		gap: 1rem;
		align-items: center;
		padding: 0 1.5rem;
	}

	.config-column {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		width: 100%;
		min-height: 0;
		overflow-y: auto;
		padding: 0.75rem 1.5rem 2rem;
	}

	.tts-sections {
		display: flex;
		flex-direction: column;
	}

	.tts-section-title {
		margin: 1.25rem 0 0.85rem;
		padding-top: 1.25rem;
		border-top: 1px solid rgba(255, 255, 255, 0.08);
		font-family: var(--font-secondary);
		font-size: 0.8rem;
		font-weight: 600;
		letter-spacing: 0.02em;
		text-transform: uppercase;
		opacity: 0.7;
	}

	.tts-section-title:first-child {
		margin-top: 0;
		padding-top: 0;
		border-top: none;
	}

	.tts-grid-2 {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1.25rem 0.75rem;
		align-items: start;
	}

	/* A lone/odd trailing control fills the row instead of leaving a hole. */
	.tts-grid-2 > :global(:last-child:nth-child(odd)) {
		grid-column: 1 / -1;
	}

	@media (max-width: 900px) {
		.tts-grid-2 {
			grid-template-columns: 1fr;
		}
	}

	.close-btn {
		position: absolute;
		top: 0.6rem;
		right: 0.9rem;
		background: none;
		border: none;
		font-size: 1.6rem;
		cursor: pointer;
		color: white;
		width: 2rem;
		height: 2rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-sm);
		transition: background-color 0.2s;
	}

	.close-btn:hover {
		background-color: rgba(255, 255, 255, 0.1);
	}

	.row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.chunk-buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		margin-top: 1rem;
	}

	.chunk-btn {
		min-width: 36px;
		height: 36px;
		padding: 0 0.6rem;
		border-radius: var(--radius-md);
		border: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(154, 154, 154, 0.12);
		color: white;
		cursor: pointer;
		font: inherit;
		font-size: 0.9rem;
		transition:
			background 0.15s ease,
			border-color 0.15s ease;
	}

	.chunk-btn:hover,
	.chunk-btn.hovered {
		background: rgba(255, 255, 255, 0.08);
		border-color: color-mix(in srgb, var(--primary-color) 40%, transparent);
	}

	.chunk-btn.selected {
		background: var(--primary-color);
		color: black;
		border-color: var(--primary-color);
		font-weight: 600;
	}

	.hint {
		margin: 0.25rem 0 0 0;
		font-size: 0.75rem;
		opacity: 0.6;
	}

	.voice-manage {
		display: flex;
		gap: 0.75rem;
		align-items: center;
		justify-content: center;
		margin-top: 2rem;
	}

	.voice-form {
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
		width: 100%;
		max-width: 420px;
		margin-inline: auto;
		text-align: left;
	}

	.voice-form-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.voice-form-header h3 {
		margin: 0;
		font-size: 0.95rem;
		font-weight: 600;
		color: white;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.voice-back {
		background: none;
		border: none;
		color: rgba(255, 255, 255, 0.6);
		font-size: 1.4rem;
		cursor: pointer;
		padding: 0;
		width: 1.75rem;
		height: 1.75rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-sm);
		transition: background-color 0.2s;
	}

	.voice-back:hover {
		background-color: rgba(255, 255, 255, 0.1);
		color: white;
	}

	.voice-image-row {
		display: flex;
		gap: 0.75rem;
		align-items: flex-end;
	}

	.voice-image {
		width: 40px;
		height: 40px;
		border-radius: var(--radius-md);
		object-fit: cover;
		flex-shrink: 0;
	}

	.voice-image--empty {
		background: rgba(154, 154, 154, 0.12);
		border: 1px solid rgba(255, 255, 255, 0.1);
	}

	.voice-grid-2 {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}

	.voice-form-actions {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.voice-delete {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		padding: 0;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: var(--radius-lg);
		background: rgba(154, 154, 154, 0.12);
		color: var(--primary-color);
		cursor: pointer;
		outline: none;
		transition: all 0.2s ease;
	}

	.voice-delete:hover:not(:disabled) {
		background: rgba(255, 80, 80, 0.2);
		border-color: rgba(255, 80, 80, 0.4);
		color: #ff5050;
	}

	.voice-delete:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.voice-status {
		margin: 0;
		font-size: 0.85rem;
		opacity: 0.8;
	}

	.voice-status.error {
		color: #ff5050;
	}

	.voice-status.done {
		color: var(--primary-color);
	}

	.voice-hint {
		margin: 0;
		font-size: 0.8rem;
		line-height: 1.4;
		opacity: 0.75;
	}

	.voice-record-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.voice-record-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		border-radius: var(--radius-lg);
		border: 1px solid rgba(255, 255, 255, 0.12);
		background: rgba(154, 154, 154, 0.12);
		color: white;
		cursor: pointer;
		font: inherit;
		transition:
			background 0.15s ease,
			border-color 0.15s ease;
	}

	.voice-record-btn:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.08);
		border-color: color-mix(in srgb, var(--primary-color) 40%, transparent);
	}

	.voice-record-btn.active {
		border-color: rgba(255, 80, 80, 0.5);
	}

	.voice-record-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.voice-record-timer {
		font-size: 0.95rem;
		font-variant-numeric: tabular-nums;
		opacity: 0.9;
	}

	.voice-record-indicator {
		width: 10px;
		height: 10px;
		border-radius: 999px;
		background: #ff5050;
		animation: voice-record-pulse 1s ease-in-out infinite;
	}

	@keyframes voice-record-pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.25;
		}
	}

	.voice-record-preview {
		width: 100%;
		margin-top: 0.25rem;
	}

	.voice-record-save {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-top: 0.5rem;
		padding-top: 0.75rem;
		border-top: 1px solid rgba(255, 255, 255, 0.08);
	}

	kbd {
		display: inline-block;
		padding: 0 0.35rem;
		font-size: 0.7rem;
		font-family: inherit;
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: var(--radius-sm);
		background: rgba(255, 255, 255, 0.05);
	}
</style>
