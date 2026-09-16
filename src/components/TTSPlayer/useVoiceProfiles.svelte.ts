import { ttsState } from '@/stores/ttsStore.svelte';
import {
	fetchVoiceChunks,
	fetchVoiceProfiles,
	type Voice,
	type VoiceProfile
} from '@/lib/utils/ttsService';
import type { WheelSelection } from '@/types/tts.types';

export function useVoiceProfiles() {
	let profiles = $state<VoiceProfile[]>([]);
	let chunks = $state<Voice[]>([]);
	let selectedProfileId = $state('');

	async function loadChunksForProfile(profileId: string, silent = false): Promise<void> {
		try {
			chunks = await fetchVoiceChunks(profileId, silent);
			ttsState.setVoiceChunks(chunks);
		} catch (err) {
			if (silent) {
				console.warn('[TTS] Failed to load voice chunks', err);
				return;
			}
			ttsState.errorMessage = err instanceof Error ? err.message : 'Failed to load voice chunks';
		}
	}

	async function handleVoiceChange(sel: WheelSelection): Promise<void> {
		const profile = profiles.find((p) => p.id === sel.profileId);
		if (profile) {
			selectedProfileId = profile.id;
			ttsState.namePrefix = profile.name_prefix;
			await loadChunksForProfile(profile.id);
			const firstChunk = chunks[0];
			if (firstChunk) {
				ttsState.config.refAudioFilename = firstChunk.audio_file;
				ttsState.config.refText = firstChunk.text_reference;
			}
		}

		ttsState.config.randomChunk = sel.randomChunk;
		ttsState.config.numStep = sel.synthParams.numStep;
		ttsState.config.guidanceScale = sel.synthParams.guidanceScale;
		ttsState.config.speed = sel.synthParams.speed;
		ttsState.config.splitLevel = sel.synthParams.splitLevel;

		ttsState.pauseSettings.minGapMs = sel.pauseSettings.minGapMs;
		ttsState.pauseSettings.maxGapMs = sel.pauseSettings.maxGapMs;
		ttsState.pauseSettings.betweenParagraphs = sel.pauseSettings.betweenParagraphs;

		if (sel.audioFile && sel.audioFile !== chunks[0]?.audio_file) {
			const picked = chunks.find((c) => c.audio_file === sel.audioFile);
			if (picked) {
				ttsState.config.refAudioFilename = picked.audio_file;
				ttsState.config.refText = picked.text_reference;
			}
		}
	}

	function handleLiveVoiceChange(sel: WheelSelection): void {
		const isActive = ttsState.isGenerating || ttsState.isPlaying;
		if (!isActive) {
			void handleVoiceChange(sel);
			return;
		}

		const profile = profiles.find((p) => p.id === sel.profileId);
		if (profile && profile.id !== selectedProfileId) {
			selectedProfileId = profile.id;
			ttsState.namePrefix = profile.name_prefix;
			void loadChunksForProfile(profile.id).then(() => {
				const idx = sel.randomChunk
					? Math.floor(Math.random() * ttsState.voiceChunks.length)
					: sel.audioFile
						? ttsState.voiceChunks.findIndex((c) => c.audio_file === sel.audioFile)
						: 0;
				ttsState.updatePendingVoiceRefs(idx >= 0 ? idx : 0);
			});
			return;
		}

		const idx = sel.randomChunk
			? Math.floor(Math.random() * ttsState.voiceChunks.length)
			: sel.audioFile
				? chunks.findIndex((c) => c.audio_file === sel.audioFile)
				: 0;
		ttsState.updatePendingVoiceRefs(idx >= 0 ? idx : 0);
	}

	async function initProfiles(): Promise<void> {
		try {
			profiles = await fetchVoiceProfiles(true);
			const match = profiles.find((p) => p.name_prefix === ttsState.namePrefix);
			if (match) {
				selectedProfileId = match.id;
				await loadChunksForProfile(match.id, true);
			}
		} catch (err) {
			console.warn('[TTS] Failed to load voices', err);
		}
	}

	return {
		get profiles() {
			return profiles;
		},
		set profiles(value: VoiceProfile[]) {
			profiles = value;
		},
		get chunks() {
			return chunks;
		},
		get selectedProfileId() {
			return selectedProfileId;
		},
		set selectedProfileId(value: string) {
			selectedProfileId = value;
		},
		loadChunksForProfile,
		handleVoiceChange,
		handleLiveVoiceChange,
		initProfiles
	};
}
