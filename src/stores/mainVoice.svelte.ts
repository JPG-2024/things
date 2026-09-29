import {
	fetchVoiceProfiles,
	fetchVoiceChunks,
	deleteVoiceProfile,
	updateVoiceProfile,
	uploadVoiceFromAudio,
	type Voice,
	type VoiceProfile
} from '@/lib/utils/ttsService';
import { ttsState } from '@/stores/ttsStore.svelte';
import { viewState } from '@/stores/viewStore.svelte';
import { settingsPersistence } from '@/stores/settingsStore.svelte';

class MainVoiceState {
	profiles = $state<VoiceProfile[]>([]);
	chunks = $state<Voice[]>([]);
	loading = $state(false);

	get selectedProfileId(): string {
		return ttsState.selectedProfileId;
	}

	set selectedProfileId(value: string) {
		ttsState.selectedProfileId = value;
	}

	/**
	 * Loads the profile list once, so voice management (edit/delete) has data
	 * even when the synthesis settings modal never opened.
	 */
	async ensureProfiles(): Promise<void> {
		if (this.profiles.length > 0) return;
		this.loading = true;
		try {
			this.profiles = await fetchVoiceProfiles();
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
		} catch (err) {
			ttsState.errorMessage = err instanceof Error ? err.message : 'Failed to load voice chunks';
		}
	}

	private async selectProfile(id: string): Promise<void> {
		this.selectedProfileId = id;
		const profile = this.profiles.find((p) => p.id === id);
		if (!profile) return;
		ttsState.namePrefix = profile.name_prefix;
		if (profile.language && !settingsPersistence.languagePersisted) {
			viewState.language = profile.language as 'en' | 'es';
		}
		await this.loadChunksForProfile(profile.id);
		const firstChunk = this.chunks[0];
		if (firstChunk) {
			ttsState.config.refAudioFilename = firstChunk.audio_file;
			ttsState.config.refText = firstChunk.text_reference;
		}
	}

	async runAddVoice(): Promise<void> {
		await this.ensureProfiles();
		await ttsState.startAddVoice();
		if (ttsState.addVoiceStatus === 'done') {
			await this.refreshAndMatch();
		}
	}

	async saveRecording(
		blob: Blob,
		opts: { namePrefix: string; imageSrc?: string }
	): Promise<string | null> {
		await this.ensureProfiles();
		try {
			const result = await uploadVoiceFromAudio(blob, opts);
			this.profiles = await fetchVoiceProfiles();
			await this.selectProfile(result.profile_id);

			const chunk = result.chunks[0];
			if (chunk) {
				ttsState.config.refAudioFilename = chunk.audio_file;
				ttsState.config.refText = chunk.text_reference;
			}
			ttsState.namePrefix = result.name_prefix;
			return result.profile_id;
		} catch (err) {
			ttsState.errorMessage = err instanceof Error ? err.message : 'Failed to save recorded voice';
			return null;
		}
	}

	private async refreshAndMatch(): Promise<void> {
		try {
			this.profiles = await fetchVoiceProfiles();
			const match = this.profiles.find((p) => p.name_prefix === ttsState.namePrefix);
			if (match) {
				await this.selectProfile(match.id);
			}
		} catch (err) {
			ttsState.errorMessage = err instanceof Error ? err.message : 'Failed to load voices';
		}
	}

	async saveProfile(profileId: string, name: string, image: string): Promise<boolean> {
		await this.ensureProfiles();
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
			return true;
		} catch (err) {
			ttsState.errorMessage = err instanceof Error ? err.message : 'Failed to update voice profile';
			return false;
		}
	}

	async deleteProfile(profileId: string): Promise<boolean> {
		if (!profileId) return false;
		await this.ensureProfiles();
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
			return true;
		} catch (err) {
			ttsState.errorMessage = err instanceof Error ? err.message : 'Failed to delete voice profile';
			return false;
		}
	}
}

export const mainVoiceState = new MainVoiceState();
