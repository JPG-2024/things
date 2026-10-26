import { isTauri } from '@tauri-apps/api/core';
import { LazyStore } from '@tauri-apps/plugin-store';
import { viewState } from '@/stores/viewStore.svelte';
import { scrapStore } from '@/stores/scrapStore.svelte';
import { ttsState, type TTSConfig } from '@/stores/ttsStore.svelte';
import { CARD_LAYOUT_DEFAULTS, type CardTab } from '@/constants';
import { clampCardLayout } from '@/lib/utils/cardLayout';
import { clampWindowLevel } from '@/lib/utils/windowAnalysis';

const STORE_FILE = 'settings.json';
const SETTINGS_VERSION = 2;

const CARD_TABS: CardTab[] = ['profiles', 'domains', 'categories'];

const LANGUAGES = ['en', 'es', 'fr', 'de', 'pt', 'it', 'ja'] as const;

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
		llamaInferenceCtxSize: viewState.llamaInferenceCtxSize,
		llamaCacheRamMb: viewState.llamaCacheRamMb,
		llamaEmbeddingsModel: viewState.llamaEmbeddingsModel,
		llamaEmbeddingsPort: viewState.llamaEmbeddingsPort,
		categoryTopN: viewState.categoryTopN,
		categoryMinSimilarity: viewState.categoryMinSimilarity,
		categoryMargin: viewState.categoryMargin,
		embeddingFields: $state.snapshot(viewState.embeddingFields),
		embeddingStoreChunkText: viewState.embeddingStoreChunkText,
		chatSearchEnabled: viewState.chatSearchEnabled,
		chatSearchTables: viewState.chatSearchTables,
		chatSearchMaxResults: viewState.chatSearchMaxResults,
		chatSearchMaxDistance: viewState.chatSearchMaxDistance,
		windowLevel: viewState.windowLevel,
		thumbnailReductionMagnitud: viewState.thumbnailReductionMagnitud,
		primaryColor: viewState.primaryColor,
		backgroundColor: viewState.backgroundColor,
		toggles: {
			glowEnabled: viewState.glowEnabled,
			autoSpeechEnabled: viewState.autoSpeechEnabled,
			forceLanguageEnabled: viewState.forceLanguageEnabled,
			clipboardTtsEnabled: viewState.clipboardTtsEnabled,
			globalShortcutConsented: viewState.globalShortcutConsented,
			embeddingsEnabled: viewState.embeddingsEnabled,
			llamaAutoStart: viewState.llamaAutoStart,
			llamaReasoning: viewState.llamaReasoning,
			captureOnlyOnPaste: viewState.captureOnlyOnPaste
		},
		cardLayout: $state.snapshot(viewState.cardLayout)
	};
}

function serializeScrap() {
	return {
		maxVideos: scrapStore.maxVideos
	};
}

function serializeTts() {
	return {
		selectedProfileId: ttsState.selectedProfileId,
		namePrefix: ttsState.namePrefix,
		config: $state.snapshot(ttsState.config),
		pauseSettings: $state.snapshot(ttsState.pauseSettings),
		prefetchDelaySeconds: ttsState.prefetchDelaySeconds
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
	if (typeof raw.llamaInferenceCtxSize === 'number') {
		viewState.llamaInferenceCtxSize = clamp(Math.trunc(raw.llamaInferenceCtxSize), 512, 131072);
	}
	if (typeof raw.llamaCacheRamMb === 'number') {
		viewState.llamaCacheRamMb = clamp(Math.trunc(raw.llamaCacheRamMb), 0, 65536);
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
		// Legacy default: the comparison now runs `topics + keywords` on both
		// sides (query and fed exemplars), so lift the old 0.35 default.
		if (raw.categoryMinSimilarity === 0.35) {
			viewState.categoryMinSimilarity = 0.5;
		}
	}
	if (typeof raw.categoryMargin === 'number') {
		viewState.categoryMargin = clamp(raw.categoryMargin, 0, 1);
	}
	if (typeof raw.chatSearchEnabled === 'boolean') {
		viewState.chatSearchEnabled = raw.chatSearchEnabled;
	}
	if (Array.isArray(raw.embeddingFields)) {
		const fields = raw.embeddingFields
			.filter((field): field is string => typeof field === 'string')
			.map((field) => field.trim())
			.filter(Boolean);
		if (fields.length > 0) {
			viewState.embeddingFields = fields;
		}
	}
	if (typeof raw.embeddingStoreChunkText === 'boolean') {
		viewState.embeddingStoreChunkText = raw.embeddingStoreChunkText;
	}
	if (typeof raw.chatSearchTables === 'string') {
		viewState.chatSearchTables = raw.chatSearchTables;
	}
	if (typeof raw.chatSearchMaxResults === 'number') {
		viewState.chatSearchMaxResults = clamp(Math.trunc(raw.chatSearchMaxResults), 1, 20);
	}
	if (typeof raw.chatSearchMaxDistance === 'number') {
		viewState.chatSearchMaxDistance = clamp(raw.chatSearchMaxDistance, 0, 2);
	}
	if (typeof raw.windowLevel === 'number') {
		viewState.windowLevel = clampWindowLevel(raw.windowLevel);
	}
	if (typeof raw.thumbnailReductionMagnitud === 'number') {
		viewState.thumbnailReductionMagnitud = clamp(Math.trunc(raw.thumbnailReductionMagnitud), 1, 8);
	}
	if (typeof raw.primaryColor === 'string') viewState.primaryColor = raw.primaryColor;
	if (typeof raw.backgroundColor === 'string') viewState.backgroundColor = raw.backgroundColor;

	const toggles = isPlainObject(raw.toggles) ? raw.toggles : {};
	if (typeof toggles.glowEnabled === 'boolean') {
		viewState.glowEnabled = toggles.glowEnabled;
	}
	if (typeof toggles.autoSpeechEnabled === 'boolean') {
		viewState.autoSpeechEnabled = toggles.autoSpeechEnabled;
	}
	if (typeof toggles.forceLanguageEnabled === 'boolean') {
		viewState.forceLanguageEnabled = toggles.forceLanguageEnabled;
	}
	if (typeof toggles.clipboardTtsEnabled === 'boolean') {
		viewState.clipboardTtsEnabled = toggles.clipboardTtsEnabled;
	}
	if (typeof toggles.globalShortcutConsented === 'boolean') {
		viewState.globalShortcutConsented = toggles.globalShortcutConsented;
	}
	if (typeof toggles.embeddingsEnabled === 'boolean') {
		viewState.embeddingsEnabled = toggles.embeddingsEnabled;
	}
	if (typeof toggles.llamaAutoStart === 'boolean') {
		viewState.llamaAutoStart = toggles.llamaAutoStart;
	}
	if (typeof toggles.llamaReasoning === 'boolean') {
		viewState.llamaReasoning = toggles.llamaReasoning;
	}
	if (typeof toggles.captureOnlyOnPaste === 'boolean') {
		viewState.captureOnlyOnPaste = toggles.captureOnlyOnPaste;
	}

	// Card layout: merge each tab section over the defaults so a partial or
	// legacy persisted shape still produces a complete CardLayout.
	const cardLayout = isPlainObject(raw.cardLayout) ? raw.cardLayout : {};
	for (const tab of CARD_TABS) {
		const rawLayout = cardLayout[tab];
		if (!isPlainObject(rawLayout)) continue;
		viewState.cardLayout[tab] = clampCardLayout(mergeValue(CARD_LAYOUT_DEFAULTS[tab], rawLayout));
	}
}

function applyScrap(raw: unknown): void {
	if (!isPlainObject(raw)) return;

	if (typeof raw.maxVideos === 'number') {
		scrapStore.maxVideos = clamp(Math.trunc(raw.maxVideos), 1, 50);
	}
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

	if (typeof raw.prefetchDelaySeconds === 'number') {
		ttsState.prefetchDelaySeconds = clamp(raw.prefetchDelaySeconds, 0, 30);
	}

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
		// Fetch all sections in parallel (one round-trip instead of three) and
		// apply them in the original order to keep hydration semantics.
		const [view, scrap, tts] = await Promise.all([
			store.get<unknown>('view'),
			store.get<unknown>('scrap'),
			store.get<unknown>('tts')
		]);
		applyView(view);
		applyScrap(scrap);
		applyTts(tts);
		store.set('version', SETTINGS_VERSION).catch((err) => {
			console.warn('[settings] failed to save version', err);
		});
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
			void activeStore.set('tts', serializeTts()).catch(warnWriteFailure);
		});
	});
}

function warnWriteFailure(err: unknown): void {
	console.warn('[settings] failed to save settings', err);
}
