import type { WheelSelection } from '@/components/modals/VoiceProfileWheel.svelte';
import {
	fetchVoiceProfiles,
	fetchVoiceChunks,
	deleteVoiceProfile,
	updateVoiceProfile,
	type Voice,
	type VoiceProfile
} from '@/lib/utils/ttsService';
import { ttsState } from '@/stores/ttsStore.svelte';
import { viewState, voiceWheelState } from '@/stores/viewStore.svelte';

class MainVoiceState {
	profiles = $state<VoiceProfile[]>([]);
	chunks = $state<Voice[]>([]);
	loading = $state(false);
	selectedProfileId = $state('');

	async open(): Promise<void> {
		await this.load();
		voiceWheelState.openWheel(
			this.profiles,
			this.chunks,
			this.buildInitial(),
			(sel) => {
				void this.commitMain(sel);
			},
			() => {
				void this.reloadChunks();
			},
			'main'
		);
	}

	async toggle(): Promise<void> {
		if (voiceWheelState.open) {
			if (voiceWheelState.mode === 'main') voiceWheelState.close();
			return;
		}
		await this.open();
	}

	buildInitial(): WheelSelection {
		return {
			profileId: this.selectedProfileId,
			audioFile: ttsState.config.refAudioFilename,
			randomChunk: ttsState.config.randomChunk,
			synthParams: {
				numStep: ttsState.config.numStep,
				guidanceScale: ttsState.config.guidanceScale,
				speed: ttsState.config.speed,
				splitLevel: ttsState.config.splitLevel
			},
			pauseSettings: { ...ttsState.pauseSettings }
		};
	}

	async load(): Promise<void> {
		this.loading = true;
		try {
			this.profiles = await fetchVoiceProfiles();
			const match = this.profiles.find((p) => p.name_prefix === ttsState.namePrefix);
			if (match) {
				this.selectedProfileId = match.id;
				if (match.language) {
					viewState.language = match.language as 'en' | 'es';
				}
				await this.loadChunksForProfile(match.id);
			}
		} catch (err) {
			ttsState.errorMessage = err instanceof Error ? err.message : 'Failed to load voices';
		} finally {
			this.loading = false;
		}
	}

	private async loadChunksForProfile(profileId: string): Promise<void> {
		try {
			this.chunks = await fetchVoiceChunks(profileId);
			ttsState.setVoiceChunks(this.chunks);
			this.syncToWheel();
		} catch (err) {
			ttsState.errorMessage = err instanceof Error ? err.message : 'Failed to load voice chunks';
		}
	}

	private syncToWheel(): void {
		if (voiceWheelState.open && voiceWheelState.mode === 'main') {
			voiceWheelState.profiles = this.profiles;
			voiceWheelState.chunks = this.chunks;
		}
	}

	private async selectProfile(id: string): Promise<void> {
		this.selectedProfileId = id;
		const profile = this.profiles.find((p) => p.id === id);
		if (!profile) return;
		ttsState.namePrefix = profile.name_prefix;
		if (profile.language) {
			viewState.language = profile.language as 'en' | 'es';
		}
		await this.loadChunksForProfile(profile.id);
		const firstChunk = this.chunks[0];
		if (firstChunk) {
			ttsState.config.refAudioFilename = firstChunk.audio_file;
			ttsState.config.refText = firstChunk.text_reference;
		}
	}

	private async commitMain(sel: WheelSelection): Promise<void> {
		if (sel.profileId && sel.profileId !== this.selectedProfileId) {
			await this.selectProfile(sel.profileId);
		}

		ttsState.config.randomChunk = sel.randomChunk;
		ttsState.config.numStep = sel.synthParams.numStep;
		ttsState.config.guidanceScale = sel.synthParams.guidanceScale;
		ttsState.config.speed = sel.synthParams.speed;
		ttsState.config.splitLevel = sel.synthParams.splitLevel;

		ttsState.pauseSettings.minGapMs = sel.pauseSettings.minGapMs;
		ttsState.pauseSettings.maxGapMs = sel.pauseSettings.maxGapMs;
		ttsState.pauseSettings.betweenParagraphs = sel.pauseSettings.betweenParagraphs;

		if (sel.audioFile && sel.audioFile !== this.chunks[0]?.audio_file) {
			const picked = this.chunks.find((c) => c.audio_file === sel.audioFile);
			if (picked) {
				ttsState.config.refAudioFilename = picked.audio_file;
				ttsState.config.refText = picked.text_reference;
			}
		}
	}

	private async reloadChunks(): Promise<void> {
		if (!this.selectedProfileId) return;
		await this.loadChunksForProfile(this.selectedProfileId);
	}

	async runAddVoice(): Promise<void> {
		await ttsState.startAddVoice();
		if (ttsState.addVoiceStatus === 'done') {
			await this.refreshAndMatch();
		}
	}

	private async refreshAndMatch(): Promise<void> {
		try {
			this.profiles = await fetchVoiceProfiles();
			this.syncToWheel();
			const match = this.profiles.find((p) => p.name_prefix === ttsState.namePrefix);
			if (match) {
				await this.selectProfile(match.id);
			}
		} catch (err) {
			ttsState.errorMessage = err instanceof Error ? err.message : 'Failed to load voices';
		}
	}

	async saveProfile(profileId: string, name: string, image: string): Promise<boolean> {
		const profile = this.profiles.find((p) => p.id === profileId);
		if (!profile) return false;

		const patch: { name_prefix?: string; image_src?: string } = {};
		const nextName = name.trim();
		if (nextName && nextName !== profile.name_prefix) patch.name_prefix = nextName;
		const nextImage = image.trim();
		if (nextImage !== (profile.image_src ?? '')) patch.image_src = nextImage || undefined;
		if (Object.keys(patch).length === 0) return true;

		try {
			await updateVoiceProfile(profile.id, patch);
			if (patch.name_prefix) {
				ttsState.namePrefix = patch.name_prefix;
			}
			this.profiles = await fetchVoiceProfiles();
			this.syncToWheel();
			return true;
		} catch (err) {
			ttsState.errorMessage = err instanceof Error ? err.message : 'Failed to update voice profile';
			return false;
		}
	}

	async deleteProfile(profileId: string): Promise<boolean> {
		if (!profileId) return false;
		try {
			await deleteVoiceProfile(profileId);
			this.profiles = this.profiles.filter((p) => p.id !== profileId);
			if (this.selectedProfileId === profileId) {
				this.chunks = [];
				this.selectedProfileId = '';
				if (this.profiles.length > 0) {
					await this.selectProfile(this.profiles[0].id);
				} else {
					ttsState.namePrefix = '';
					ttsState.setVoiceChunks([]);
				}
			}
			this.syncToWheel();
			return true;
		} catch (err) {
			ttsState.errorMessage = err instanceof Error ? err.message : 'Failed to delete voice profile';
			return false;
		}
	}
}

export const mainVoiceState = new MainVoiceState();
