import {
	fetchVoiceProfiles,
	deleteVoiceProfile,
	updateVoiceProfile,
	uploadVoiceFromAudio
} from '@/lib/utils/ttsService';
import { ttsState } from '@/stores/ttsStore.svelte';
import { viewState } from '@/stores/viewStore.svelte';
import { settingsPersistence } from '@/stores/settingsStore.svelte';

/**
 * Voice-profile management operations (add/edit/delete voice). Holds no state
 * of its own: the profile list and the chunks live in `ttsState`
 * (BOOT-2b consolidated voice state).
 */
class MainVoiceState {
	/** Non-silent boot loader: surfaces failures in the TTS error message. */
	async ensureProfiles(): Promise<void> {
		if (ttsState.voiceProfiles.length > 0) return;
		try {
			ttsState.voiceProfiles = await fetchVoiceProfiles();
		} catch (err) {
			ttsState.errorMessage = err instanceof Error ? err.message : 'Failed to load voices';
		}
	}

	private async selectProfile(id: string): Promise<void> {
		ttsState.selectedProfileId = id;
		const profile = ttsState.voiceProfiles.find((p) => p.id === id);
		if (!profile) return;
		ttsState.namePrefix = profile.name_prefix;
		if (profile.language && !settingsPersistence.languagePersisted) {
			viewState.language = profile.language as 'en' | 'es';
		}
		await ttsState.loadVoiceChunksForProfile(profile.id);
		const firstChunk = ttsState.voiceChunks[0];
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
			ttsState.voiceProfiles = await fetchVoiceProfiles({ force: true });
			await this.selectProfile(result.profile_id);

			const chunk = result.chunks[0];
			if (chunk) {
				ttsState.config.refAudioFilename = chunk.audio_file;
				ttsState.config.refText = chunk.text_reference;
			}
			ttsState.namePrefix = result.name_prefix;
			return result.profile_id;
		} catch (err) {
			ttsState.errorMessage =
				err instanceof Error ? err.message : 'Failed to save recorded voice';
			return null;
		}
	}

	private async refreshAndMatch(): Promise<void> {
		try {
			ttsState.voiceProfiles = await fetchVoiceProfiles({ force: true });
			const match = ttsState.voiceProfiles.find((p) => p.name_prefix === ttsState.namePrefix);
			if (match) {
				await this.selectProfile(match.id);
			}
		} catch (err) {
			ttsState.errorMessage = err instanceof Error ? err.message : 'Failed to load voices';
		}
	}

	async saveProfile(profileId: string, name: string, image: string): Promise<boolean> {
		await this.ensureProfiles();
		const profile = ttsState.voiceProfiles.find((p) => p.id === profileId);
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
			ttsState.voiceProfiles = await fetchVoiceProfiles({ force: true });
			return true;
		} catch (err) {
			ttsState.errorMessage =
				err instanceof Error ? err.message : 'Failed to update voice profile';
			return false;
		}
	}

	async deleteProfile(profileId: string): Promise<boolean> {
		if (!profileId) return false;
		await this.ensureProfiles();
		try {
			await deleteVoiceProfile(profileId);
			ttsState.voiceProfiles = ttsState.voiceProfiles.filter((p) => p.id !== profileId);
			if (ttsState.selectedProfileId === profileId) {
				ttsState.setVoiceChunks([]);
				ttsState.selectedProfileId = '';
				if (ttsState.voiceProfiles.length > 0) {
					await this.selectProfile(ttsState.voiceProfiles[0].id);
				} else {
					ttsState.namePrefix = '';
					ttsState.setVoiceChunks([]);
				}
			}
			return true;
		} catch (err) {
			ttsState.errorMessage =
				err instanceof Error ? err.message : 'Failed to delete voice profile';
			return false;
		}
	}
}

export const mainVoiceState = new MainVoiceState();
