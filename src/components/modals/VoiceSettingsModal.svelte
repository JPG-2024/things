<script lang="ts">
	import { onDestroy } from 'svelte';
	import { createHotkey } from '@tanstack/svelte-hotkeys';
	import { fade, scale } from 'svelte/transition';
	import {
		deleteVoiceChunk,
		getImage,
		type Voice,
		type VoiceProfile
	} from '@/lib/utils/ttsService';
	import { startSystemRecording, stopSystemRecording } from '@/lib/utils/systemAudioRecorder';
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
	import type { PauseSettings, SynthParams } from '@/types/tts.types';

	interface SettingsValue {
		audioFile: string;
		randomChunk: boolean;
		synthParams: SynthParams;
		pauseSettings: PauseSettings;
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
		onChange: (value: SettingsValue) => void;
		onClose: () => void;
		onChunksChanged?: () => void;
		/** Enables voice management (Add/Edit/Record). TTS only. */
		management?: boolean;
		profiles?: VoiceProfile[];
		selectedProfileId?: string;
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
		onChange,
		onClose,
		onChunksChanged,
		management = false,
		profiles = [],
		selectedProfileId = '',
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

	// Decorative bat art, kept out of the template so whitespace/indentation
	// are preserved exactly. Trailing spaces are trimmed per line to avoid
	// phantom horizontal scroll.
	const ASCII_ART = [
		'                                  #%**#+',
		'                                 =%    %.',
		'                                 %=    *+',
		'                                =%     .%',
		'                   .+**=        #=      *+        .+**=',
		'                  .##**#=      -%       .%       .##**#+',
		'                  #+   +#      *+   ==   #+      **   -%',
		'                 ##     %.    .%   =##=  -%      %-    *#',
		'                +#      *+    +*   #==#   #=    +#      ##',
		'                %.      -%    %.  -%  %-  =%    #=       %=',
		'               #+   .    #=  +#   *+  +*   %=  -%    .   -%',
		'              ##   ###   +#  %=   %.  .%   =%  *+   ###   ##',
		'        +****%#   +# #+   %.=%   +*    *+   %= %.  +# #+   #%****+',
		'       ##****=    %. =%   #-%=   %-    -%   =%-#   %= .%    =****##',
		'      .*        -#*   %=  ==#   =#      #=   #==  =%   +#-        *.',
		'       *%******#%=    +#        %=      =%        #+    =%#*****#%*',
		'        .+*****=       %.      =%        %=      .%       =*****+.',
		'                       *+      #=        =%      +*',
		'                       -%     =%          %=     %-',
		'                        #=    #=          =#    =#',
		'                        =#   -%            %-   #=',
		'                         ##**#=            =#**##',
		'                          =**=              =**='
	].join('\n');

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

	function snapshot(): SettingsValue {
		return {
			audioFile: draftAudioFile,
			randomChunk: draftRandomChunk,
			synthParams: { ...draftSynthParams },
			pauseSettings: { ...draftPauseSettings }
		};
	}

	function applyAndClose() {
		onChange(snapshot());
		onClose();
	}

	async function handleClose() {
		if (isRecording) await stopRecording(true);
		revokeRecordedUrl();
		applyAndClose();
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
		}
		wasOpen = show;
	});

	// Ensure an in-progress recording is discarded if the modal is closed from
	// the outside (the component stays mounted, so onDestroy alone is not enough).
	$effect(() => {
		if (!show && isRecording) {
			void stopRecording(true);
			revokeRecordedUrl();
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
			ignoreInputs: true,
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
		onclick={handleClose}
		transition:fade={{ duration: 180 }}
	>
		<div
			class="settings-modal"
			role="dialog"
			aria-label={title}
			tabindex="-1"
			transition:scale={{ start: 0.85, duration: 180 }}
			onclick={(e) => e.stopPropagation()}
		>
			<button class="close-btn" type="button" aria-label="Close settings" onclick={handleClose}>
				×
			</button>

			<div class="ascii-header">
				<!-- <pre class="ascii-art" aria-hidden="true">{ASCII_ART}</pre> -->
				<p class="ascii-caption">{title}</p>
			</div>

			<div class="config-column">
				{#if management}
					<Spacer title="Voices" icon="Users" defaultOpen={false}>
						{#if manageView === 'buttons'}
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
									Captures everything playing on your default output device. Anything this app plays
									while recording is captured too.
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
										<span>{recordingBusy ? 'Please wait...' : isRecording ? 'Stop' : 'Record'}</span
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
					</Spacer>
				{/if}

				<Spacer title="Chunk" icon="Podcast" defaultOpen={false}>
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
				</Spacer>

				<Spacer title="Synthesis" icon="SlidersHorizontal" defaultOpen={false}>
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
				</Spacer>

				{#if showPauses}
					<Spacer title="Pauses" icon="Timer" defaultOpen={false}>
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
					</Spacer>
				{/if}

				{#if management}
					<Spacer title="Playback" icon="Volume2" defaultOpen={false}>
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
		background: rgba(0, 0, 0, 0.92);
		backdrop-filter: blur(24px);
		-webkit-backdrop-filter: blur(24px);
		z-index: 100000;
	}

	.settings-modal {
		position: relative;
		width: 100%;
		max-width: 460px;
		max-height: 92vh;
		overflow-y: auto;
		background: rgba(14, 14, 14, 0.98);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: var(--radius-lg);
		padding: 2rem 1.5rem 2rem;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 1.25rem;
		color: white;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
	}

	.ascii-header {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.35rem;
	}

	.ascii-caption {
		font-family: var(--font-secondary);
		margin: 0;
		font-size: 1.2rem;
		color: var(--primary-color);
		opacity: 0.3;
		padding: 1rem 0;
		letter-spacing: 0.02em;
	}

	.ascii-art {
		margin: 0 auto;
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 0.4rem;
		line-height: 0.7;
		white-space: pre;
		color: var(--primary-color);
		opacity: 0.2;
		max-width: 100%;
		overflow-x: auto;
		user-select: none;
	}

	.config-column {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		width: 100%;
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
