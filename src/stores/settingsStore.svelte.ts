import { isTauri } from '@tauri-apps/api/core';
import { LazyStore } from '@tauri-apps/plugin-store';
import { viewState } from '@/stores/viewStore.svelte';
import { scrapStore } from '@/stores/scrapStore.svelte';
import { podcastState, type PodcastConfig } from '@/features/podcast/podcastStore.svelte';
import { ttsState, type TTSConfig } from '@/stores/ttsStore.svelte';

const STORE_FILE = 'settings.json';
const SETTINGS_VERSION = 1;

const LANGUAGES = ['en', 'es', 'fr', 'de', 'pt', 'it', 'ja'] as const;
const CONTEXT_SOURCES = ['content', 'summary', 'none'] as const;
const SPEAKER_DYNAMICS = ['alternate', 'free'] as const;

type PauseSettings = typeof ttsState.pauseSettings;

/**
 * Flags shared with other stores. `languagePersisted` is only set when a valid
 * language was loaded from disk, so the voice profile may seed the language on
 * the very first run but never override an already persisted one.
 */
export const settingsPersistence = {
	languagePersisted: false
};

let store: LazyStore | null = null;
let loaded = false;
let persistenceStarted = false;

// Snapshot the built-in defaults before any component can mutate them, so a
// partial persisted section can be deep-merged back onto a full shape.
const PODCAST_DEFAULTS: PodcastConfig = clonePlain(podcastState.config);
const TTS_CONFIG_DEFAULTS: TTSConfig = clonePlain(ttsState.config);
const TTS_PAUSE_DEFAULTS: PauseSettings = clonePlain(ttsState.pauseSettings);

function clonePlain<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Deep-merge `patch` over `defaultValue`. Primitives only win when the type
 * matches, arrays are replaced wholesale, unknown keys are dropped.
 */
function mergeValue<T>(defaultValue: T, patch: unknown): T {
	if (Array.isArray(defaultValue)) {
		return (Array.isArray(patch) ? patch : defaultValue) as T;
	}
	if (isPlainObject(defaultValue)) {
		if (!isPlainObject(patch)) return defaultValue;
		const out: Record<string, unknown> = { ...defaultValue };
		for (const key of Object.keys(defaultValue)) {
			if (Object.prototype.hasOwnProperty.call(patch, key)) {
				out[key] = mergeValue(
					(defaultValue as Record<string, unknown>)[key],
					(patch as Record<string, unknown>)[key]
				);
			}
		}
		return out as T;
	}
	if (defaultValue === null || defaultValue === undefined) {
		return (patch === undefined ? defaultValue : patch) as T;
	}
	return (typeof patch === typeof defaultValue ? patch : defaultValue) as T;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function detectTauri(): boolean {
	try {
		return isTauri();
	} catch {
		return false;
	}
}

function serializeView() {
	return {
		language: viewState.language,
		aiProvider: viewState.aiProvider,
		aiUrl: viewState.aiUrl,
		aiModel: viewState.aiModel,
		llamaModelsDir: viewState.llamaModelsDir,
		llamaInferenceModel: viewState.llamaInferenceModel,
		llamaInferencePort: viewState.llamaInferencePort,
		llamaEmbeddingsModel: viewState.llamaEmbeddingsModel,
		llamaEmbeddingsPort: viewState.llamaEmbeddingsPort,
		categoryTopN: viewState.categoryTopN,
		categoryMinSimilarity: viewState.categoryMinSimilarity,
		thumbnailReductionMagnitud: viewState.thumbnailReductionMagnitud,
		primaryColor: viewState.primaryColor,
		backgroundColor: viewState.backgroundColor,
		toggles: {
			autoSpeechEnabled: viewState.autoSpeechEnabled,
			forceLanguageEnabled: viewState.forceLanguageEnabled,
			clipboardTtsEnabled: viewState.clipboardTtsEnabled,
			embeddingsEnabled: viewState.embeddingsEnabled
		}
	};
}

function serializeScrap() {
	return {
		parallelFetch: scrapStore.parallelFetch,
		maxVideos: scrapStore.maxVideos,
		parallelVideosAmount: scrapStore.parallelVideosAmount
	};
}

function serializeTts() {
	return {
		selectedProfileId: ttsState.selectedProfileId,
		namePrefix: ttsState.namePrefix,
		config: $state.snapshot(ttsState.config),
		pauseSettings: $state.snapshot(ttsState.pauseSettings)
	};
}

function applyView(raw: unknown): void {
	if (!isPlainObject(raw)) return;

	if ((LANGUAGES as readonly string[]).includes(raw.language as string)) {
		viewState.language = raw.language as typeof viewState.language;
		settingsPersistence.languagePersisted = true;
	}
	if (raw.aiProvider === 'llama' || raw.aiProvider === 'openrouter') {
		viewState.aiProvider = raw.aiProvider;
	}
	if (typeof raw.aiUrl === 'string') viewState.aiUrl = raw.aiUrl;
	if (typeof raw.aiModel === 'string') viewState.aiModel = raw.aiModel;
	if (typeof raw.llamaModelsDir === 'string') viewState.llamaModelsDir = raw.llamaModelsDir;
	if (typeof raw.llamaInferenceModel === 'string') {
		viewState.llamaInferenceModel = raw.llamaInferenceModel;
	}
	if (typeof raw.llamaInferencePort === 'number') {
		viewState.llamaInferencePort = clamp(Math.trunc(raw.llamaInferencePort), 1024, 65535);
	}
	if (typeof raw.llamaEmbeddingsModel === 'string') {
		viewState.llamaEmbeddingsModel = raw.llamaEmbeddingsModel;
	}
	if (typeof raw.llamaEmbeddingsPort === 'number') {
		viewState.llamaEmbeddingsPort = clamp(Math.trunc(raw.llamaEmbeddingsPort), 1024, 65535);
	}
	if (typeof raw.categoryTopN === 'number') {
		viewState.categoryTopN = clamp(Math.trunc(raw.categoryTopN), 1, 10);
	}
	if (typeof raw.categoryMinSimilarity === 'number') {
		viewState.categoryMinSimilarity = clamp(raw.categoryMinSimilarity, 0, 1);
	}
	if (typeof raw.thumbnailReductionMagnitud === 'number') {
		viewState.thumbnailReductionMagnitud = clamp(Math.trunc(raw.thumbnailReductionMagnitud), 1, 8);
	}
	if (typeof raw.primaryColor === 'string') viewState.primaryColor = raw.primaryColor;
	if (typeof raw.backgroundColor === 'string') viewState.backgroundColor = raw.backgroundColor;

	const toggles = isPlainObject(raw.toggles) ? raw.toggles : {};
	if (typeof toggles.autoSpeechEnabled === 'boolean') {
		viewState.autoSpeechEnabled = toggles.autoSpeechEnabled;
	}
	if (typeof toggles.forceLanguageEnabled === 'boolean') {
		viewState.forceLanguageEnabled = toggles.forceLanguageEnabled;
	}
	if (typeof toggles.clipboardTtsEnabled === 'boolean') {
		viewState.clipboardTtsEnabled = toggles.clipboardTtsEnabled;
	}
	if (typeof toggles.embeddingsEnabled === 'boolean') {
		viewState.embeddingsEnabled = toggles.embeddingsEnabled;
	}
}

function applyScrap(raw: unknown): void {
	if (!isPlainObject(raw)) return;

	if (typeof raw.parallelFetch === 'boolean') scrapStore.parallelFetch = raw.parallelFetch;
	if (typeof raw.maxVideos === 'number') {
		scrapStore.maxVideos = clamp(Math.trunc(raw.maxVideos), 1, 50);
	}
	if (typeof raw.parallelVideosAmount === 'number') {
		scrapStore.parallelVideosAmount = clamp(Math.trunc(raw.parallelVideosAmount), 1, 10);
	}
}

function applyPodcast(raw: unknown): void {
	if (!isPlainObject(raw)) return;

	const merged = mergeValue(PODCAST_DEFAULTS, raw);
	if (!(SPEAKER_DYNAMICS as readonly string[]).includes(merged.speakerDynamics)) {
		merged.speakerDynamics = PODCAST_DEFAULTS.speakerDynamics;
	}
	if (!(CONTEXT_SOURCES as readonly string[]).includes(merged.contextSource)) {
		merged.contextSource = PODCAST_DEFAULTS.contextSource;
	}
	merged.topicCount = clamp(Math.trunc(merged.topicCount), 1, 10);
	merged.interactionsPerTopic = clamp(Math.trunc(merged.interactionsPerTopic), 2, 15);
	merged.turnLengthSentences = clamp(Math.trunc(merged.turnLengthSentences), 1, 8);
	merged.scriptTemperature = clamp(merged.scriptTemperature, 0, 1.5);
	merged.topicGapMs = clamp(merged.topicGapMs, 0, 5000);
	merged.exchangeGapMs = clamp(merged.exchangeGapMs, 0, 3000);
	for (const synth of [merged.hostASynthParams, merged.hostBSynthParams]) {
		synth.numStep = clamp(Math.trunc(synth.numStep), 1, 64);
		synth.guidanceScale = clamp(synth.guidanceScale, 0, 5);
		synth.speed = clamp(synth.speed, 0.25, 2);
		synth.splitLevel = clamp(Math.trunc(synth.splitLevel), 0, 3) as 0 | 1 | 2 | 3;
	}

	podcastState.config = merged;
	// A persisted podcast section exists: do not auto-randomize hosts anymore.
	podcastState.hostsHydrated = true;
}

function applyTts(raw: unknown): void {
	if (!isPlainObject(raw)) return;

	const mergedConfig = mergeValue(TTS_CONFIG_DEFAULTS, raw.config);
	mergedConfig.splitLevel = clamp(
		Math.trunc(mergedConfig.splitLevel),
		0,
		3
	) as TTSConfig['splitLevel'];
	ttsState.config = mergedConfig;

	ttsState.pauseSettings = mergeValue(TTS_PAUSE_DEFAULTS, raw.pauseSettings);

	if (typeof raw.selectedProfileId === 'string') {
		ttsState.selectedProfileId = raw.selectedProfileId;
	}
	if (typeof raw.namePrefix === 'string') {
		ttsState.namePrefix = raw.namePrefix;
	}
}

/**
 * Loads settings from disk and applies them to the stores. No-op outside Tauri
 * (e.g. plain browser dev server).
 */
export async function loadSettings(): Promise<void> {
	if (loaded || !detectTauri()) return;
	store = new LazyStore(STORE_FILE, { autoSave: true });
	loaded = true;

	try {
		applyView(await store.get<unknown>('view'));
		applyScrap(await store.get<unknown>('scrap'));
		applyPodcast(await store.get<unknown>('podcast'));
		applyTts(await store.get<unknown>('tts'));
		await store.set('version', SETTINGS_VERSION);
	} catch (err) {
		console.warn('[settings] failed to load settings', err);
	}
}

/**
 * Registers the write effects. Must be called after {@link loadSettings} so the
 * initial effect run does not persist during hydration.
 */
export function startSettingsPersistence(): void {
	if (!store || persistenceStarted) return;
	persistenceStarted = true;

	const activeStore = store;
	$effect.root(() => {
		$effect(() => {
			void activeStore.set('view', serializeView()).catch(warnWriteFailure);
		});
		$effect(() => {
			void activeStore.set('scrap', serializeScrap()).catch(warnWriteFailure);
		});
		$effect(() => {
			void activeStore.set('podcast', $state.snapshot(podcastState.config)).catch(warnWriteFailure);
		});
		$effect(() => {
			void activeStore.set('tts', serializeTts()).catch(warnWriteFailure);
		});
	});
}

function warnWriteFailure(err: unknown): void {
	console.warn('[settings] failed to save settings', err);
}
