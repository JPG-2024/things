<script lang="ts">
	import { onDestroy } from 'svelte';
	import { createHotkey } from '@tanstack/svelte-hotkeys';
	import Input from '@/components/inputs/Input.component.svelte';
	import Button from '@/components/inputs/Button.component.svelte';
	import Dropdown from '@/components/inputs/Dropdown.component.svelte';
	import LoadingLine from '@/components/LoadingLine.svelte';
	import WheelStage from '@/components/WheelStage.svelte';
	import Icon from '@/components/Icon.svelte';
	import { getImage, type VoiceProfile } from '@/lib/utils/ttsService';
	import { colorFor, initialFor } from '@/lib/utils/avatar';
	import { startSystemRecording, stopSystemRecording } from '@/lib/utils/systemAudioRecorder';
	import { ttsState } from '@/stores/ttsStore.svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import { fly } from 'svelte/transition';

	interface Props {
		profiles: VoiceProfile[];
		selectedProfileId: string;
		filter?: string;
		placeholder?: string;
		label?: string;
		onPick: (profile: VoiceProfile) => void;
		actionIcon?: string;
		actionLabel?: string;
		onAction?: () => void;
		/** Opens the synthesis settings modal for the current context. */
		onSettings?: () => void;
		/** Enables voice management (Add/Edit/Record). TTS only. */
		management?: boolean;
		onAddVoice?: () => void | Promise<void>;
		onSaveProfile?: (profileId: string, name: string, image: string) => Promise<boolean>;
		onDeleteProfile?: (profileId: string) => Promise<boolean>;
		onRecordingReady?: (blob: Blob) => void;
		onSaveRecording?: (
			blob: Blob,
			opts: { namePrefix: string; imageSrc?: string }
		) => Promise<string | null>;
		onProfilesChanged?: () => void | Promise<void>;
	}

	let {
		profiles,
		selectedProfileId,
		filter = $bindable(''),
		placeholder = 'Filter voices...',
		label,
		onPick,
		actionIcon = 'X',
		actionLabel = 'Close picker',
		onAction,
		onSettings,
		management = false,
		onAddVoice,
		onSaveProfile,
		onDeleteProfile,
		onRecordingReady,
		onSaveRecording,
		onProfilesChanged
	}: Props = $props();

	const NEW_PROFILE_VALUE = '__new__';

	let panelView = $state<'wheel' | 'add' | 'edit' | 'record'>('wheel');
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

	const filteredProfiles = $derived(
		filter.trim() === ''
			? profiles
			: profiles.filter((p) => p.name_prefix.toLowerCase().includes(filter.trim().toLowerCase()))
	);

	function autoScroll(node: HTMLElement, selected: boolean) {
		function apply(isSelected: boolean) {
			if (isSelected)
				node.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
		}
		apply(selected);
		return {
			update(newSelected: boolean) {
				apply(newSelected);
			}
		};
	}

	$effect(() => {
		if (!isRecording) return;
		const id = setInterval(() => {
			recordingSeconds += 1;
		}, 1000);
		return () => clearInterval(id);
	});

	$effect(() => {
		if (panelView !== 'record' && isRecording) {
			void stopRecording(true);
		}
	});

	onDestroy(() => {
		if (isRecording) void stopRecording(true);
		revokeRecordedUrl();
	});

	function openAddPanel() {
		panelView = 'add';
	}

	function openEditPanel() {
		const profile = profiles.find((p) => p.id === selectedProfileId);
		if (!profile) return;
		editTargetId = profile.id;
		editName = profile.name_prefix;
		editImage = profile.image_src ?? '';
		panelView = 'edit';
	}

	function openRecordPanel() {
		saveTargetProfileId = NEW_PROFILE_VALUE;
		saveNamePrefix = '';
		saveImageSrc = '';
		recordingSaved = false;
		panelView = 'record';
	}

	function backToWheel() {
		panelView = 'wheel';
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
				backToWheel();
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
				backToWheel();
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
				onRecordingReady?.(blob);
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
		panelView = 'wheel';
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
				if (filter.trim()) filter = '';
				recordingSaved = true;
				await onProfilesChanged?.();
				panelView = 'wheel';
			}
		} finally {
			recordingSaving = false;
		}
	}

	createHotkey(
		'Escape',
		() => {
			if (panelView === 'record') {
				void exitRecordPanel();
			} else if (panelView !== 'wheel') {
				panelView = 'wheel';
			}
		},
		() => ({
			enabled: panelView !== 'wheel',
			ignoreInputs: true,
			stopPropagation: true,
			preventDefault: true
		})
	);

	createHotkey('Shift+R', toggleRecording, () => ({
		enabled: panelView === 'record',
		ignoreInputs: true,
		preventDefault: true
	}));
</script>

<div class="mini-picker" transition:fly={{ duration: 200, y: 40 }}>
	{#if panelView === 'wheel'}
		<div class="mini-picker__header">
			{#if label}
				<span class="mini-picker__label">{label}</span>
			{/if}
			<div class="mini-picker__filter">
				<Input
					search={true}
					bind:value={filter}
					{placeholder}
					autofocus={true}
					onEnter={() => {
						const first = filteredProfiles[0];
						if (first) onPick(first);
					}}
				/>
			</div>
			{#if onSettings}
				<button
					type="button"
					class="mini-picker__action"
					onclick={(e) => {
						e.stopPropagation();
						onSettings();
					}}
					aria-label="Synthesis settings"
					title="Synthesis settings"
				>
					<Icon name="SlidersHorizontal" size={18} />
				</button>
			{/if}
			{#if onAction}
				<button
					type="button"
					class="mini-picker__action"
					onclick={(e) => {
						e.stopPropagation();
						onAction();
					}}
					aria-label={actionLabel}
					title={actionLabel}
				>
					<Icon name={actionIcon} size={18} />
				</button>
			{/if}
		</div>

		{#if filteredProfiles.length === 0}
			<p class="mini-picker__empty">No matching voices</p>
		{:else}
			<WheelStage gap={12} scrollSpeed={10}>
				{#each filteredProfiles as profile (profile.id)}
					{@const isSelected = profile.id === selectedProfileId}
					<button
						type="button"
						class="mini-picker__profile"
						class:selected={isSelected}
						use:autoScroll={isSelected}
						onclick={(e) => {
							e.stopPropagation();
							onPick(profile);
						}}
						aria-label={profile.name_prefix}
						aria-pressed={isSelected}
					>
						<div class="mini-picker__avatar-wrap">
							{#if profile.image_src}
								<img
									class="mini-picker__avatar"
									src={getImage(profile.image_src)}
									alt={profile.name_prefix}
								/>
							{:else}
								<div
									class="mini-picker__avatar fallback"
									style="background: {colorFor(profile.id)}"
								>
									<span>{initialFor(profile.name_prefix)}</span>
								</div>
							{/if}
						</div>
						<span class="mini-picker__profile-name">{profile.name_prefix}</span>
					</button>
				{/each}
			</WheelStage>
		{/if}

		{#if management}
			<div class="mini-picker__manage">
				<Button icon="Mic" onClick={openRecordPanel}>Record</Button>
				<Button icon="UserRoundPlus" onClick={openAddPanel}>Add voice</Button>
				<Button icon="UserRoundPen" disabled={!selectedProfileId} onClick={openEditPanel}
					>Edit voice</Button
				>
			</div>
		{/if}
	{:else if panelView === 'add'}
		<div class="mini-picker__form">
			<div class="mini-picker__form-header">
				<h3>
					<Icon name="UserRoundPlus" size={18} color={viewState.primaryColor} />
					<span>Add voice</span>
				</h3>
				<button class="mini-picker__back" type="button" aria-label="Back" onclick={backToWheel}>
					×
				</button>
			</div>
			<Input
				id="miniVideoUrl"
				label="Video URL"
				bind:value={ttsState.videoUrl}
				placeholder="https://..."
			/>
			<div class="mini-picker__image-row">
				{#if ttsState.imageSrc}
					<img class="mini-picker__image" src={ttsState.imageSrc} alt="voice preview" />
				{:else}
					<div class="mini-picker__image mini-picker__image--empty"></div>
				{/if}
				<Input
					id="miniImageSrc"
					label="Image URL"
					bind:value={ttsState.imageSrc}
					placeholder="https://..."
				/>
			</div>
			<div class="mini-picker__grid-2">
				<Input id="miniSegment" label="Segment" bind:value={ttsState.segment} />
				<Input
					id="miniChunkCount"
					label="Chunk Count"
					type="number"
					min="1"
					value={String(ttsState.chunkCount)}
					onChange={(v) => (ttsState.chunkCount = parseInt(v) || 1)}
				/>
			</div>
			<Input id="miniNamePrefix" label="Name Prefix" bind:value={ttsState.namePrefix} />
			<div class="mini-picker__form-actions">
				<Button disabled={ttsState.addVoiceLoading} onClick={handleAddVoice}>
					{ttsState.addVoiceLoading ? 'Processing...' : 'Add Voice'}
				</Button>
			</div>
			<LoadingLine loading={ttsState.addVoiceLoading} />
			{#if ttsState.addVoiceStatus}
				<p
					class="mini-picker__status"
					class:error={ttsState.addVoiceStatus === 'error'}
					class:done={ttsState.addVoiceStatus === 'done'}
				>
					{ttsState.addVoiceStatus === 'done' ? '✓ ' : ''}{addVoiceStatusLabel()}
				</p>
			{/if}
		</div>
	{:else if panelView === 'edit'}
		<div class="mini-picker__form">
			<div class="mini-picker__form-header">
				<h3>
					<Icon name="UserRoundPen" size={18} color={viewState.primaryColor} />
					<span>Edit voice</span>
				</h3>
				<button class="mini-picker__back" type="button" aria-label="Back" onclick={backToWheel}>
					×
				</button>
			</div>
			<Input id="miniEditName" label="Name Prefix" bind:value={editName} />
			<div class="mini-picker__image-row">
				{#if editImage}
					<img class="mini-picker__image" src={getImage(editImage)} alt="profile preview" />
				{:else}
					<div class="mini-picker__image mini-picker__image--empty"></div>
				{/if}
				<Input
					id="miniEditImage"
					label="Image URL"
					bind:value={editImage}
					placeholder="https://..."
				/>
			</div>
			<div class="mini-picker__form-actions">
				<Button disabled={editSaving || !editTargetId} onClick={handleSaveProfile}>
					{editSaving ? 'Saving...' : 'Save Profile'}
				</Button>
				<button
					type="button"
					class="mini-picker__delete"
					onclick={handleDeleteProfile}
					disabled={editSaving || !editTargetId}
					aria-label="Delete voice profile"
					title="Delete voice profile"
				>
					<Icon name="Trash" />
				</button>
			</div>
		</div>
	{:else if panelView === 'record'}
		<div class="mini-picker__form">
			<div class="mini-picker__form-header">
				<h3>
					<Icon name="Mic" size={18} color={viewState.primaryColor} />
					<span>Record system audio</span>
				</h3>
				<button
					class="mini-picker__back"
					type="button"
					aria-label="Back"
					onclick={() => void exitRecordPanel()}
				>
					×
				</button>
			</div>
			<p class="mini-picker__hint">
				Captures everything playing on your default output device. Anything this app plays while
				recording is captured too.
			</p>
			<div class="mini-picker__record-row">
				<button
					type="button"
					class="mini-picker__record-btn"
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
					<span>{recordingBusy ? 'Please wait...' : isRecording ? 'Stop' : 'Record'}</span>
				</button>
				{#if isRecording}
					<span class="mini-picker__record-indicator"></span>
					<span class="mini-picker__record-timer">{formatDuration(recordingSeconds)}</span>
				{/if}
			</div>
			<p class="mini-picker__hint">Press <kbd>Shift</kbd>+<kbd>R</kbd> to start / stop</p>
			{#if recordedUrl}
				<audio class="mini-picker__record-preview" controls src={recordedUrl}></audio>
				<div class="mini-picker__record-save">
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
						<Input id="miniRecordName" label="Name Prefix" bind:value={saveNamePrefix} />
						<Input
							id="miniRecordImage"
							label="Image URL (optional)"
							bind:value={saveImageSrc}
							placeholder="https://..."
						/>
					{/if}
					<div class="mini-picker__form-actions">
						<Button
							disabled={recordingSaving ||
								(saveTargetProfileId === NEW_PROFILE_VALUE && !saveNamePrefix.trim())}
							onClick={handleSaveRecording}
						>
							{recordingSaving ? 'Saving...' : 'Save as voice'}
						</Button>
					</div>
					{#if recordingSaved}
						<p class="mini-picker__status done">✓ Saved to voice profile</p>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.mini-picker {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		width: 100%;
		align-items: center;
	}

	.mini-picker__header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 50%;
		min-width: 340px;
	}

	.mini-picker__label {
		font-size: 0.75rem;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.5);
		white-space: nowrap;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.mini-picker__filter {
		flex: 1;
		min-width: 0;
	}

	.mini-picker__action {
		all: unset;
		box-sizing: border-box;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 34px;
		height: 34px;
		border-radius: var(--radius-md);
		color: var(--primary-color);
		cursor: pointer;
		background: rgba(154, 154, 154, 0.12);
		border: 1px solid rgba(255, 255, 255, 0.1);
		transition: background 0.2s ease;
	}

	.mini-picker__action:hover {
		background: rgba(255, 255, 255, 0.12);
	}

	.mini-picker__empty {
		margin: 0;
		padding: 0.5rem 0;
		text-align: center;
		font-size: 0.85rem;
		color: white;
		opacity: 0.6;
	}

	.mini-picker__profile {
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.35rem 0.5rem;
		background: transparent;
		border: none;
		color: inherit;
		font: inherit;
		cursor: pointer;
		border-radius: var(--radius-lg);
		transition: background-color 0.2s ease;
	}

	.mini-picker__profile:hover {
		background: rgba(255, 255, 255, 0.06);
	}

	.mini-picker__profile.selected {
		cursor: default;
	}

	.mini-picker__avatar-wrap {
		flex-shrink: 0;
		width: 40px;
		height: 40px;
		border-radius: 999px;
		overflow: hidden;
		transition: box-shadow 240ms ease;
	}

	.mini-picker__profile.selected .mini-picker__avatar-wrap {
		box-shadow: 0 0 0 2px var(--primary-color);
	}

	.mini-picker__avatar {
		width: 100%;
		height: 100%;
		object-fit: cover;
		border: 1px solid rgba(255, 255, 255, 0.1);
		box-sizing: border-box;
	}

	.mini-picker__avatar.fallback {
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		font-weight: bold;
		font-size: 1.2rem;
		user-select: none;
	}

	.mini-picker__profile-name {
		max-width: 92px;
		font-size: 0.8rem;
		font-weight: 600;
		color: white;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.mini-picker__manage {
		display: flex;
		gap: 0.75rem;
		align-items: center;
		justify-content: center;
		padding-top: 0.25rem;
	}

	.mini-picker__form {
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
		width: 100%;
		max-width: 420px;
		margin-inline: auto;
		text-align: left;
	}

	.mini-picker__form-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.mini-picker__form-header h3 {
		margin: 0;
		font-size: 0.95rem;
		font-weight: 600;
		color: white;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.mini-picker__back {
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

	.mini-picker__back:hover {
		background-color: rgba(255, 255, 255, 0.1);
		color: white;
	}

	.mini-picker__image-row {
		display: flex;
		gap: 0.75rem;
		align-items: flex-end;
	}

	.mini-picker__image {
		width: 40px;
		height: 40px;
		border-radius: var(--radius-md);
		object-fit: cover;
		flex-shrink: 0;
	}

	.mini-picker__image--empty {
		background: rgba(154, 154, 154, 0.12);
		border: 1px solid rgba(255, 255, 255, 0.1);
	}

	.mini-picker__grid-2 {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}

	.mini-picker__form-actions {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.mini-picker__delete {
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

	.mini-picker__delete:hover:not(:disabled) {
		background: rgba(255, 80, 80, 0.2);
		border-color: rgba(255, 80, 80, 0.4);
		color: #ff5050;
	}

	.mini-picker__delete:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.mini-picker__status {
		margin: 0;
		font-size: 0.85rem;
		opacity: 0.8;
	}

	.mini-picker__status.error {
		color: #ff5050;
	}

	.mini-picker__status.done {
		color: var(--primary-color);
	}

	.mini-picker__hint {
		margin: 0;
		font-size: 0.8rem;
		line-height: 1.4;
		opacity: 0.75;
	}

	.mini-picker__record-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.mini-picker__record-btn {
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

	.mini-picker__record-btn:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.08);
		border-color: color-mix(in srgb, var(--primary-color) 40%, transparent);
	}

	.mini-picker__record-btn.active {
		border-color: rgba(255, 80, 80, 0.5);
	}

	.mini-picker__record-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.mini-picker__record-timer {
		font-size: 0.95rem;
		font-variant-numeric: tabular-nums;
		opacity: 0.9;
	}

	.mini-picker__record-indicator {
		width: 10px;
		height: 10px;
		border-radius: 999px;
		background: #ff5050;
		animation: mini-record-pulse 1s ease-in-out infinite;
	}

	@keyframes mini-record-pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.25;
		}
	}

	.mini-picker__record-preview {
		width: 100%;
		margin-top: 0.25rem;
	}

	.mini-picker__record-save {
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
