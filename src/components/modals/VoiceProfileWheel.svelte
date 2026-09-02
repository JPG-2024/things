<script lang="ts">
	import { createHotkey } from '@tanstack/svelte-hotkeys';
	import { fade, scale } from 'svelte/transition';
	import {
		getImage,
		deleteVoiceChunk,
		type Voice,
		type VoiceProfile
	} from '@/lib/utils/ttsService';
	import { colorFor, initialFor } from '@/lib/utils/avatar';
	import Icon from '@/components/Icon.svelte';
	import Dropdown from '../inputs/Dropdown.component.svelte';
	import Input from '../inputs/Input.component.svelte';
	import Button from '../inputs/Button.component.svelte';
	import RangeSelector from '../inputs/RangeSelector.svelte';
	import ToggleIcon from '@/components/ToggleIcon.svelte';
	import Spacer from '@/components/Spacer.component.svelte';
	import LoadingLine from '@/components/LoadingLine.svelte';
	import { ttsState } from '@/stores/ttsStore.svelte';
	import { viewState } from '@/stores/viewStore.svelte';

	export type SynthParams = {
		numStep: number;
		guidanceScale: number;
		speed: number;
		splitLevel: 0 | 1 | 2 | 3;
	};

	export type PauseSettings = {
		minGapMs: number;
		maxGapMs: number;
		betweenParagraphs: number;
	};

	export type WheelSelection = {
		profileId: string;
		audioFile: string;
		randomChunk: boolean;
		synthParams: SynthParams;
		pauseSettings: PauseSettings;
	};

	type Props = {
		show: boolean;
		profiles: VoiceProfile[];
		chunks: Voice[];
		initial: WheelSelection;
		onCommit: (selection: WheelSelection) => void;
		onClose: () => void;
		onChunksChanged?: () => void;
		mode?: 'main' | 'select';
		onAddVoice?: () => void | Promise<void>;
		onSaveProfile?: (profileId: string, name: string, image: string) => Promise<boolean>;
		onDeleteProfile?: (profileId: string) => Promise<boolean>;
	};

	let {
		show,
		profiles,
		chunks,
		initial,
		onCommit,
		onClose,
		onChunksChanged,
		mode = 'select',
		onAddVoice,
		onSaveProfile,
		onDeleteProfile
	}: Props = $props();

	const ITEM_HEIGHT = 80;
	const STAGE_HEIGHT = 360;
	const WHEEL_THRESHOLD = 40;

	let draftProfileId = $state('');
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

	let committed = $state(false);
	let wasOpen = $state(false);
	let hoveredChunkName = $state<string | null>(null);
	let filterText = $state('');
	let panelView = $state<'wheel' | 'add' | 'edit'>('wheel');
	let editTargetId = $state('');
	let editName = $state('');
	let editImage = $state('');
	let editSaving = $state(false);
	let filteredProfiles = $derived(
		filterText.trim() === ''
			? profiles
			: profiles.filter((p) =>
					p.name_prefix.toLowerCase().includes(filterText.trim().toLowerCase())
				)
	);
	let draftProfileIndex = $derived.by(() => {
		const idx = filteredProfiles.findIndex((p) => p.id === draftProfileId);
		return idx >= 0 ? idx : 0;
	});

	$effect(() => {
		if (show && !wasOpen) {
			draftProfileId = initial.profileId || (profiles[0]?.id ?? '');
			draftAudioFile = initial.audioFile;
			draftRandomChunk = initial.randomChunk;
			draftSynthParams = { ...initial.synthParams };
			draftPauseSettings = { ...initial.pauseSettings };
			hoveredChunkName = null;
			committed = false;
			filterText = '';
			panelView = 'wheel';
		}
		wasOpen = show;
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

	$effect(() => {
		filterText;
		if (filteredProfiles.length > 0 && !filteredProfiles.some((p) => p.id === draftProfileId)) {
			draftProfileId = filteredProfiles[0].id;
		}
	});

	function clampId(index: number): string {
		if (filteredProfiles.length === 0) return '';
		const clamped = Math.max(0, Math.min(filteredProfiles.length - 1, index));
		return filteredProfiles[clamped]?.id ?? '';
	}

	function commit() {
		if (committed) return;
		committed = true;
		onCommit({
			profileId: draftProfileId || initial.profileId,
			audioFile: draftAudioFile,
			randomChunk: draftRandomChunk,
			synthParams: { ...draftSynthParams },
			pauseSettings: { ...draftPauseSettings }
		});
	}

	function commitAndClose() {
		commit();
		onClose();
	}

	function commitConfigOnly() {
		if (committed) return;
		committed = true;
		onCommit({
			profileId: initial.profileId,
			audioFile: draftAudioFile,
			randomChunk: draftRandomChunk,
			synthParams: { ...draftSynthParams },
			pauseSettings: { ...draftPauseSettings }
		});
	}

	function exitApplyingConfig() {
		commitConfigOnly();
		onClose();
	}

	function shift(delta: number) {
		if (filteredProfiles.length === 0) return;
		draftProfileId = clampId(draftProfileIndex + delta);
	}

	function handleWheel(e: WheelEvent) {
		if (panelView !== 'wheel') return;
		if (filteredProfiles.length === 0) return;
		e.preventDefault();
		const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
		if (Math.abs(delta) < WHEEL_THRESHOLD) return;
		if (delta > 0) {
			shift(1);
		} else {
			shift(-1);
		}
	}

	function handleItemClick(index: number) {
		if (index === draftProfileIndex) {
			commitAndClose();
			return;
		}
		draftProfileId = clampId(index);
	}

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
		panelView = 'add';
	}

	function openEditPanel() {
		const profile = profiles.find((p) => p.id === draftProfileId);
		if (!profile) return;
		editTargetId = profile.id;
		editName = profile.name_prefix;
		editImage = profile.image_src ?? '';
		panelView = 'edit';
	}

	function backToWheel() {
		panelView = 'wheel';
	}

	async function handleSaveProfile() {
		if (!editTargetId || editSaving) return;
		editSaving = true;
		try {
			const ok = await onSaveProfile?.(editTargetId, editName, editImage);
			if (ok !== false) backToWheel();
		} finally {
			editSaving = false;
		}
	}

	async function handleDeleteProfile() {
		if (!editTargetId || editSaving) return;
		editSaving = true;
		try {
			const ok = await onDeleteProfile?.(editTargetId);
			if (ok !== false) backToWheel();
		} finally {
			editSaving = false;
		}
	}

	createHotkey(
		'ArrowDown',
		() => shift(1),
		() => ({
			enabled: show && panelView === 'wheel' && filteredProfiles.length > 0,
			ignoreInputs: true
		})
	);

	createHotkey(
		'ArrowUp',
		() => shift(-1),
		() => ({
			enabled: show && panelView === 'wheel' && filteredProfiles.length > 0,
			ignoreInputs: true
		})
	);

	createHotkey(
		'Home',
		() => {
			if (filteredProfiles.length > 0) draftProfileId = filteredProfiles[0].id;
		},
		() => ({
			enabled: show && panelView === 'wheel' && filteredProfiles.length > 0,
			ignoreInputs: true
		})
	);

	createHotkey(
		'End',
		() => {
			if (filteredProfiles.length > 0) {
				draftProfileId = filteredProfiles[filteredProfiles.length - 1].id;
			}
		},
		() => ({
			enabled: show && panelView === 'wheel' && filteredProfiles.length > 0,
			ignoreInputs: true
		})
	);

	createHotkey('Enter', commitAndClose, () => ({
		enabled: show && panelView === 'wheel',
		ignoreInputs: true
	}));

	createHotkey(
		'Escape',
		() => {
			if (panelView !== 'wheel') {
				panelView = 'wheel';
			} else if (filterText) {
				filterText = '';
			} else {
				exitApplyingConfig();
			}
		},
		() => ({
			enabled: show,
			ignoreInputs: true,
			stopPropagation: true,
			preventDefault: true
		})
	);

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

	function itemStyle(index: number): string {
		const offset = index - draftProfileIndex;
		const abs = Math.abs(offset);
		const scale = abs === 0 ? 1.15 : abs === 1 ? 0.82 : abs === 2 ? 0.66 : 0.52;
		const opacity = abs === 0 ? 1 : abs === 1 ? 0.55 : abs === 2 ? 0.3 : 0.12;
		const translateY = `calc(-50% + ${offset * ITEM_HEIGHT}px)`;
		return `transform: translate(-50%, -50%) translateY(${offset * ITEM_HEIGHT}px) scale(${scale}); opacity: ${opacity};`;
	}

	const SPLIT_OPTIONS = [
		{ label: 'Coarse (paragraphs only)', value: '0' },
		{ label: 'Default (paragraphs + sentences)', value: '1' },
		{ label: 'Medium (+ clauses)', value: '2' },
		{ label: 'Fine (+ soft breaks)', value: '3' }
	];
</script>

{#if show}
	<div
		class="wheel-backdrop"
		role="presentation"
		onclick={exitApplyingConfig}
		transition:fade={{ duration: 180 }}
	>
		<div
			class="wheel-modal"
			role="dialog"
			aria-label="Voice and synthesis settings"
			tabindex="-1"
			transition:scale={{ start: 0.85, duration: 180 }}
			onclick={(e) => e.stopPropagation()}
			onwheel={handleWheel}
		>
			<button
				class="close-btn"
				type="button"
				aria-label="Close settings"
				onclick={exitApplyingConfig}
			>
				×
			</button>

			<div class="wheel-grid">
				<div class="config-column">
					<div class="wheel-header">
						<Icon name="SlidersVertical" size={26} color={viewState.primaryColor} />
						<h2>Voice & synthesis</h2>
					</div>
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
							id="wheel-numStep"
							label="Num Steps"
							value={draftSynthParams.numStep}
							min={1}
							max={64}
							step={1}
							format={(v) => v.toString()}
							onChange={(v) => (draftSynthParams.numStep = v)}
						/>
						<RangeSelector
							id="wheel-guidanceScale"
							label="Guidance Scale"
							value={draftSynthParams.guidanceScale}
							min={0}
							max={5}
							step={0.5}
							format={(v) => v.toFixed(1)}
							onChange={(v) => (draftSynthParams.guidanceScale = v)}
						/>
						<RangeSelector
							id="wheel-speed"
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

					<Spacer title="Pauses" icon="Timer" defaultOpen={false}>
						<RangeSelector
							id="wheel-minGapMs"
							label="Min gap between sentences (s)"
							value={draftPauseSettings.minGapMs}
							min={0}
							max={1}
							step={0.01}
							format={(v) => v.toFixed(2)}
							onChange={(v) => (draftPauseSettings.minGapMs = v)}
						/>
						<RangeSelector
							id="wheel-maxGapMs"
							label="Max gap between sentences (s)"
							value={draftPauseSettings.maxGapMs}
							min={0}
							max={1}
							step={0.01}
							format={(v) => v.toFixed(2)}
							onChange={(v) => (draftPauseSettings.maxGapMs = v)}
						/>
						<RangeSelector
							id="wheel-betweenParagraphs"
							label="Pause between paragraphs (s)"
							value={draftPauseSettings.betweenParagraphs}
							min={0}
							max={2}
							step={0.01}
							format={(v) => v.toFixed(2)}
							onChange={(v) => (draftPauseSettings.betweenParagraphs = v)}
						/>
					</Spacer>
				</div>

				<div class="profiles-column">
					{#if mode === 'main' && panelView === 'add'}
						<div class="form-panel">
							<div class="form-header">
								<h3>
									<Icon name="UserRoundPlus" size={18} color={viewState.primaryColor} />
									<span>Add voice</span>
								</h3>
								<button class="back-btn" type="button" aria-label="Back" onclick={backToWheel}>
									×
								</button>
							</div>
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
							<div class="form-grid-2">
								<Input id="segment" label="Segment" bind:value={ttsState.segment} />
								<Input
									id="chunkCount"
									label="Chunk Count"
									type="number"
									min="1"
									value={String(ttsState.chunkCount)}
									onChange={(v) => (ttsState.chunkCount = parseInt(v) || 1)}
								/>
							</div>
							<Input id="namePrefix" label="Name Prefix" bind:value={ttsState.namePrefix} />
							<div class="form-actions">
								<Button disabled={ttsState.addVoiceLoading} onClick={() => onAddVoice?.()}>
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
						</div>
					{:else if mode === 'main' && panelView === 'edit'}
						<div class="form-panel">
							<div class="form-header">
								<h3>
									<Icon name="UserRoundPen" size={18} color={viewState.primaryColor} />
									<span>Edit voice</span>
								</h3>
								<button class="back-btn" type="button" aria-label="Back" onclick={backToWheel}>
									×
								</button>
							</div>
							<Input id="editNamePrefix" label="Name Prefix" bind:value={editName} />
							<div class="image-preview-row">
								{#if editImage}
									<img class="image-preview" src={getImage(editImage)} alt="profile preview" />
								{:else}
									<div class="image-preview image-preview-empty"></div>
								{/if}
								<Input
									id="editImageSrc"
									label="Image URL"
									bind:value={editImage}
									placeholder="https://..."
								/>
							</div>
							<div class="form-actions">
								<Button disabled={editSaving || !editTargetId} onClick={handleSaveProfile}>
									{editSaving ? 'Saving...' : 'Save Profile'}
								</Button>
								<button
									type="button"
									class="delete-profile-btn"
									onclick={handleDeleteProfile}
									disabled={editSaving || !editTargetId}
									aria-label="Delete voice profile"
									title="Delete voice profile"
								>
									<Icon name="Trash" />
								</button>
							</div>
						</div>
					{:else}
						{#if profiles.length > 0}
							<div class="filter-wrap">
								<Input
									search={true}
									bind:value={filterText}
									placeholder="Filter voices..."
									onEnter={commitAndClose}
								/>
								{#if filterText}
									<button class="filter-clear" type="button" onclick={() => (filterText = '')}>
										×
									</button>
								{/if}
							</div>
						{/if}

						{#if profiles.length === 0}
							<div class="empty-state">
								<p>No voices available.</p>
								<p class="empty-hint">Add a voice to get started.</p>
							</div>
						{:else if filteredProfiles.length === 0}
							<div class="empty-state">
								<p>No matching voices.</p>
								<p class="empty-hint">Try a different filter.</p>
							</div>
						{:else}
							<div class="stage" style="--stage-height: {STAGE_HEIGHT}px;">
								<div class="guide guide-top"></div>
								<div class="guide guide-bottom"></div>
								{#each filteredProfiles as profile, i (profile.id)}
									<button
										type="button"
										class="wheel-item"
										class:active={i === draftProfileIndex}
										style={itemStyle(i)}
										onclick={() => handleItemClick(i)}
										aria-label={profile.name_prefix}
										aria-pressed={i === draftProfileIndex}
									>
										<div class="avatar-wrap">
											{#if profile.image_src}
												<img
													class="avatar"
													src={getImage(profile.image_src)}
													alt={profile.name_prefix}
												/>
											{:else}
												<div class="avatar fallback" style="background: {colorFor(profile.id)}">
													<span class="fallback-letter">{initialFor(profile.name_prefix)}</span>
												</div>
											{/if}
										</div>
										<div class="meta">
											<span class="name">{profile.name_prefix}</span>
											{#if profile.language}
												<span class="lang">{profile.language.toUpperCase()}</span>
											{/if}
										</div>
									</button>
								{/each}
							</div>

							<div class="counter">
								<span class="counter-current">{draftProfileIndex + 1}</span>
								<span class="counter-sep">/</span>
								<span class="counter-total">{filteredProfiles.length}</span>
							</div>
						{/if}

						{#if mode === 'main'}
							<div class="voice-form-actions">
								<Button icon="UserRoundPlus" onClick={openAddPanel}>Add voice</Button>
								<Button
									icon="UserRoundPen"
									disabled={filteredProfiles.length === 0}
									onClick={openEditPanel}
								>
									Edit voice
								</Button>
							</div>
						{/if}
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.wheel-backdrop {
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

	.wheel-modal {
		position: relative;
		width: fit-content;
		max-width: 92vw;
		min-width: 680px;
		min-height: 100vh;
		overflow-y: auto;
		background: rgba(14, 14, 14, 0.98);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: var(--radius-lg);
		padding: 2rem 1.5rem 1.5rem;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 1rem;
		color: white;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
	}

	.wheel-grid {
		display: grid;
		grid-template-columns: 320px 280px;
		gap: 1.5rem;
		align-items: start;
	}

	.config-column {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.profiles-column {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	@media (max-width: 700px) {
		.wheel-modal {
			min-width: 320px;
		}

		.wheel-grid {
			grid-template-columns: 1fr;
		}

		.profiles-column {
			order: -1;
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
		z-index: 100000;
	}

	.close-btn:hover {
		background-color: rgba(255, 255, 255, 0.1);
	}

	.wheel-header {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.6rem;
		color: var(--primary-color);
	}

	.wheel-header h2 {
		margin: 0;
		font-size: 1.05rem;
		font-weight: 600;
		color: white;
	}

	.filter-wrap {
		position: relative;
		width: 100%;
	}

	.filter-clear {
		position: absolute;
		right: 0.5rem;
		top: 50%;
		transform: translateY(-50%);
		background: none;
		border: none;
		color: rgba(255, 255, 255, 0.6);
		font-size: 1.2rem;
		cursor: pointer;
		padding: 0;
		width: 1.5rem;
		height: 1.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-sm);
		transition: background-color 0.2s;
	}

	.filter-clear:hover {
		background-color: rgba(255, 255, 255, 0.1);
		color: white;
	}

	.stage {
		position: relative;
		height: 80vh;
		width: 100%;
		overflow: hidden;
		-webkit-mask-image: linear-gradient(
			to bottom,
			transparent 0%,
			black 14%,
			black 90%,
			transparent 100%
		);
		mask-image: linear-gradient(to bottom, transparent 0%, black 22%, black 78%, transparent 100%);
	}

	.guide {
		position: absolute;
		left: 8%;
		right: 8%;
		height: 1px;
		background: color-mix(in srgb, var(--bg-color) 35%, transparent);
		pointer-events: none;
		z-index: 1;
	}

	.guide-top {
		top: calc(50% - 56px);
	}

	.guide-bottom {
		top: calc(50% + 56px);
	}

	.wheel-item {
		position: absolute;
		top: 50%;
		left: 50%;
		transform-origin: center center;
		display: flex;
		align-items: center;

		gap: 1rem;
		padding: 0.5rem 0.75rem;
		background: transparent;
		border: none;
		color: inherit;
		font: inherit;
		cursor: pointer;
		transition:
			transform 320ms cubic-bezier(0.2, 0.8, 0.2, 1),
			opacity 320ms cubic-bezier(0.2, 0.8, 0.2, 1);
		will-change: transform, opacity;
		border-radius: var(--radius-lg);
	}

	.wheel-item.active {
		cursor: default;
	}

	.avatar-wrap {
		flex-shrink: 0;
		width: 40px;
		height: 40px;
		border-radius: 999px;
		overflow: hidden;
		transition: box-shadow 240ms ease;
	}

	.wheel-item.active .avatar-wrap {
		box-shadow: 0 0 0 2px var(--primary-color);
	}

	.avatar {
		width: 100%;
		height: 100%;
		object-fit: cover;
		border: 1px solid rgba(255, 255, 255, 0.1);
		box-sizing: border-box;
	}

	.fallback {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		font-weight: bold;
		font-size: 1.6rem;
		user-select: none;
		border: 1px solid rgba(255, 255, 255, 0.1);
		box-sizing: border-box;
	}

	.meta {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.2rem;
		text-align: left;
	}

	.name {
		font-size: 1rem;
		font-weight: 600;
	}

	.lang {
		font-size: 0.7rem;
		opacity: 0.6;
		letter-spacing: 0.05em;
	}

	.wheel-item:not(.active) .meta {
		opacity: 0.85;
	}

	.counter {
		display: flex;
		justify-content: center;
		gap: 0.25rem;
		font-size: 0.8rem;
		opacity: 0.6;
		font-variant-numeric: tabular-nums;
	}

	.counter-current {
		color: var(--primary-color);
		font-weight: 600;
	}

	.counter-sep {
		opacity: 0.4;
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

	kbd {
		display: inline-block;
		padding: 0 0.35rem;
		font-size: 0.7rem;
		font-family: inherit;
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: var(--radius-sm);
		background: rgba(255, 255, 255, 0.05);
	}

	.empty-state {
		text-align: center;
		padding: 3rem 1rem;
		opacity: 0.7;
	}

	.empty-state p {
		margin: 0.25rem 0;
	}

	.empty-hint {
		font-size: 0.85rem;
		opacity: 0.7;
	}

	.form-panel {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 0.25rem 0.25rem 1rem;
	}

	.form-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.form-header h3 {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
		color: white;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.back-btn {
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

	.back-btn:hover {
		background-color: rgba(255, 255, 255, 0.1);
		color: white;
	}

	.form-grid-2 {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}

	.form-actions {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.voice-form-actions {
		display: flex;
		justify-content: center;
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
		border-radius: var(--radius-md);
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
		border-radius: var(--radius-lg);
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

	.status {
		margin: 0;
		font-size: 0.85rem;
		opacity: 0.8;
	}

	.status.error {
		color: #ff5050;
	}

	.status.done {
		color: var(--primary-color);
	}
</style>
