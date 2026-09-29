<script lang="ts">
	import { onDestroy } from 'svelte';
	import { createHotkey } from '@tanstack/svelte-hotkeys';
	import { fade, scale } from 'svelte/transition';
	import { deleteVoiceChunk, type Voice } from '@/lib/utils/ttsService';
	import { viewState } from '@/stores/viewStore.svelte';
	import { ttsState } from '@/stores/ttsStore.svelte';
	import Icon from '@/components/Icon.svelte';
	import Dropdown from '@/components/inputs/Dropdown.component.svelte';
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
		onChunksChanged
	}: Props = $props();

	const SPLIT_OPTIONS = [
		{ label: 'Coarse (paragraphs only)', value: '0' },
		{ label: 'Default (paragraphs + sentences)', value: '1' },
		{ label: 'Medium (+ clauses)', value: '2' },
		{ label: 'Fine (+ soft breaks)', value: '3' }
	];

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

	$effect(() => {
		if (show && !wasOpen) {
			draftAudioFile = audioFile;
			draftRandomChunk = randomChunk;
			draftSynthParams = { ...synthParams };
			draftPauseSettings = { ...pauseSettings };
			hoveredChunkName = null;
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

	onDestroy(() => {
		hoveredChunkName = null;
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
			if (hoveredChunkName) {
				hoveredChunkName = null;
			} else {
				applyAndClose();
			}
		},
		() => ({
			enabled: show,
			ignoreInputs: true,
			stopPropagation: true,
			preventDefault: true
		})
	);
</script>

{#if show}
	<div
		class="settings-backdrop"
		role="presentation"
		onclick={applyAndClose}
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
			<button class="close-btn" type="button" aria-label="Close settings" onclick={applyAndClose}>
				×
			</button>

			<h2 class="settings-title">
				<Icon name="SlidersHorizontal" size={18} color={viewState.primaryColor} />
				<span>{title}</span>
			</h2>

			<div class="config-column">
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

	.settings-title {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
		color: white;
		display: flex;
		align-items: center;
		gap: 0.5rem;
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
