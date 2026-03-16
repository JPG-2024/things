import { invoke } from "@tauri-apps/api/core";
import { get, writable } from "svelte/store";
import { viewState } from "@/stores/viewStore.svelte";
import {
	AVAILABLE_LANGUAGES,
	cleanupTTSFile,
	synthesizeSpeech,
	type TTSLanguage,
	type TTSOptions,
	type TTSResult,
} from "@/lib/utils/tts";

const DEFAULT_ONNX_DIR = `${import.meta.env.VITE_SUPERTONIC_PATH}/onnx`;
const DEFAULT_VOICE_STYLE_PATH = `${import.meta.env.VITE_SUPERTONIC_PATH}/voice_styles`;
export const AVAILABLE_VOICES = [
	"M1",
	"F1",
	"M2",
	"F2",
	"M3",
	"F3",
	"M4",
	"F4",
] as const;
type AvailableVoice = (typeof AVAILABLE_VOICES)[number];

type CachedAudio = {
	inputKey: string;
	result: TTSResult;
};

type TTSStoreState = {
	activeId: string | null;
	isLoading: boolean;
	isPlaying: boolean;
	errorMessage: string;
	fullDurationSeconds: number;
	remainingSeconds: number;
	cachedDurationById: Record<string, number>;
	selectedVoice: AvailableVoice;
	speed: number;
	totalStep: number;
};

type PlayParams = {
	id: string;
	text: string;
	language?: TTSLanguage;
	options?: TTSOptions;
};

const DEFAULT_TTS_OPTIONS: TTSOptions = {
	speed: 1.3,
	onnx_dir: DEFAULT_ONNX_DIR,
	total_step: 6,
};

function createInputKey(
	text: string,
	language: TTSLanguage,
	voiceStylePath: string,
	options?: TTSOptions
) {
	return JSON.stringify([text, language, voiceStylePath, options ?? null]);
}

class TTSStore {
	state = writable<TTSStoreState>({
		activeId: null,
		isLoading: false,
		isPlaying: false,
		errorMessage: "",
		fullDurationSeconds: 0,
		remainingSeconds: 0,
		cachedDurationById: {},
		selectedVoice: AVAILABLE_VOICES[0],
		speed: 1.3,
		totalStep: 6,
	});

	private cacheById: Record<string, CachedAudio> = {};
	private countdownTimer: ReturnType<typeof setInterval> | null = null;
	private finishTimer: ReturnType<typeof setTimeout> | null = null;

	private patch(next: Partial<TTSStoreState>) {
		this.state.update((prev) => ({ ...prev, ...next }));
	}

	private clearTimers() {
		if (this.countdownTimer) {
			clearInterval(this.countdownTimer);
			this.countdownTimer = null;
		}

		if (this.finishTimer) {
			clearTimeout(this.finishTimer);
			this.finishTimer = null;
		}
	}

	private restoreDuration() {
		const state = get(this.state);
		this.clearTimers();
		this.patch({
			isPlaying: false,
			remainingSeconds: state.fullDurationSeconds,
		});
		currentDuration.set(state.fullDurationSeconds);
	}

	private async cleanupCacheForId(id: string) {
		const cached = this.cacheById[id];
		if (!cached?.result.file_path) {
			return;
		}

		delete this.cacheById[id];

		try {
			await cleanupTTSFile(cached.result.file_path);
		} catch (cleanupError) {
			console.error("Error cleaning up TTS file:", cleanupError);
		}

		this.state.update((prev) => {
			const nextDurations = { ...prev.cachedDurationById };
			delete nextDurations[id];
			return {
				...prev,
				cachedDurationById: nextDurations,
			};
		});
	}

	private async ensureSpeech({ id, text }: PlayParams): Promise<TTSResult> {
		const trimmedText = text.trim();

		if (!trimmedText) {
			throw new Error("Text is required for TTS playback");
		}

		const resolvedVoiceStylePath = `${DEFAULT_VOICE_STYLE_PATH}/${get(this.state).selectedVoice}.json`;
		const resolvedOptions = {
			...DEFAULT_TTS_OPTIONS,
			speed: get(this.state).speed,
			total_step: get(this.state).totalStep,
		};
		const inputKey = createInputKey(
			trimmedText,
			viewState.language as TTSLanguage,
			resolvedVoiceStylePath,
			resolvedOptions
		);
		const cached = this.cacheById[id];

		if (cached && cached.inputKey === inputKey) {
			return cached.result;
		}

		if (cached) {
			await this.cleanupCacheForId(id);
		}

		const result = await synthesizeSpeech(
			trimmedText,
			viewState.language,
			resolvedVoiceStylePath,
			resolvedOptions
		);
		this.cacheById[id] = { inputKey, result };

		this.state.update((prev) => ({
			...prev,
			cachedDurationById: {
				...prev.cachedDurationById,
				[id]: Math.max(1, Math.ceil(result.duration)),
			},
		}));

		return result;
	}

	private startCountdown(durationSeconds: number) {
		this.clearTimers();
		this.patch({
			isPlaying: true,
			fullDurationSeconds: durationSeconds,
			remainingSeconds: durationSeconds,
		});
		currentDuration.set(durationSeconds);

		this.countdownTimer = setInterval(() => {
			this.state.update((prev) => {
				const nextRemaining =
					prev.remainingSeconds > 0 ? prev.remainingSeconds - 1 : 0;
				currentDuration.set(nextRemaining);
				return {
					...prev,
					remainingSeconds: nextRemaining,
				};
			});
		}, 1000);

		this.finishTimer = setTimeout(() => {
			this.restoreDuration();
		}, durationSeconds * 1000);
	}

	async play(params: PlayParams): Promise<void> {
		const { id } = params;
		const prevState = get(this.state);
		const cachedDuration = prevState.cachedDurationById[id] ?? 0;

		if (prevState.activeId && prevState.activeId !== id) {
			await this.stop();
			await this.cleanupCacheForId(prevState.activeId);
		}

		this.patch({
			activeId: id,
			isLoading: true,
			errorMessage: "",
			fullDurationSeconds: cachedDuration,
			remainingSeconds: cachedDuration,
		});

		try {
			const result = await this.ensureSpeech(params);
			const durationSeconds = Math.max(1, Math.ceil(result.duration));
			await invoke("play_tts_file", { filePath: result.file_path });
			this.startCountdown(durationSeconds);
		} catch (playbackError) {
			this.patch({
				errorMessage:
					playbackError instanceof Error
						? playbackError.message
						: "Failed to play TTS",
			});
			this.restoreDuration();
			throw playbackError;
		} finally {
			this.patch({ isLoading: false });
		}
	}

	async stop(): Promise<void> {
		try {
			await invoke("stop_tts_playback");
		} catch (stopError) {
			console.error("Error stopping TTS playback:", stopError);
		}

		this.restoreDuration();
	}

	async cleanupAll() {
		this.clearTimers();
		await this.stop();

		const ids = Object.keys(this.cacheById);
		for (const id of ids) {
			await this.cleanupCacheForId(id);
		}
	}
}

export const currentDuration = writable(0);
export const ttsStore = new TTSStore();
