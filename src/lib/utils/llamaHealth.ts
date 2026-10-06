import { invoke } from '@tauri-apps/api/core';
import { viewState } from '@/stores/viewStore.svelte';
import type { LlamaModelEntry, LlamaServerStatus } from '@/lib/utils/llamaModels';

export type { LlamaServerStatus };

const POLL_INTERVAL_MS = 15000;
const REQUEST_TIMEOUT_MS = 4000;

function trimTrailingSlash(url: string): string {
	return url.replace(/\/+$/, '');
}

async function fetchOk(url: string): Promise<boolean> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
	try {
		const response = await fetch(url, { signal: controller.signal });
		return response.ok;
	} catch {
		return false;
	} finally {
		clearTimeout(timeout);
	}
}

async function checkService(baseUrl: string): Promise<boolean> {
	const url = trimTrailingSlash(baseUrl);
	if (await fetchOk(`${url}/health`)) return true;
	return fetchOk(`${url}/v1/models`);
}

/**
 * Check both llama-server instances and mirror the result into `viewState`.
 */
export async function refreshLlamaHealth(): Promise<void> {
	const [inferenceUp, embeddingsUp] = await Promise.all([
		checkService(viewState.llamaBaseUrl),
		checkService(viewState.embeddingsBaseUrl)
	]);
	viewState.inferenceServiceUp = inferenceUp;
	viewState.embeddingsServiceUp = embeddingsUp;
}

/**
 * Poll both services and mirror their health into `viewState`.
 * Returns a stop function for cleanup.
 */
export function startLlamaHealthPolling(): () => void {
	void refreshLlamaHealth();
	const interval = setInterval(() => void refreshLlamaHealth(), POLL_INTERVAL_MS);
	return () => clearInterval(interval);
}

export interface LlamaModelsListing {
	dir: string;
	models: LlamaModelEntry[];
}

export async function listLlamaModels(
	dir: string = viewState.llamaModelsDir
): Promise<LlamaModelsListing> {
	const listing = await invoke<LlamaModelsListing>('list_llama_models', { dir });
	if (!viewState.llamaModelsDir.trim() && listing.dir) {
		viewState.llamaModelsDir = listing.dir;
	}
	return listing;
}

interface LlamaDefaults {
	modelsDir: string;
	inferenceModel: string;
	embeddingsModel: string;
	inferencePort: number;
	embeddingsPort: number;
}

function resolveSelection(current: string, names: Set<string>, fallback: string): string {
	if (current && names.has(current)) return current;
	if (fallback && names.has(fallback)) return fallback;
	return '';
}

/**
 * Align the persisted model selections with the files that actually exist in
 * the models directory. A stale name (renamed/removed file, case mismatch) is
 * replaced by the matching `.env` default when available, otherwise cleared so
 * the user has to pick explicitly. This also seeds the first run.
 */
export async function reconcileLlamaModels(): Promise<void> {
	let defaults: LlamaDefaults;
	try {
		defaults = await invoke<LlamaDefaults>('llama_defaults');
		if (!viewState.llamaModelsDir.trim()) viewState.llamaModelsDir = defaults.modelsDir;
	} catch (error) {
		console.warn('[llama] failed to load defaults', error);
		return;
	}

	let listing: LlamaModelsListing;
	try {
		listing = await listLlamaModels(viewState.llamaModelsDir);
	} catch (error) {
		console.warn('[llama] failed to list models', error);
		return;
	}
	if (listing.dir) viewState.llamaModelsDir = listing.dir;

	const names = new Set(listing.models.map((model) => model.name));
	viewState.llamaInferenceModel = resolveSelection(
		viewState.llamaInferenceModel,
		names,
		defaults.inferenceModel
	);
	viewState.llamaEmbeddingsModel = resolveSelection(
		viewState.llamaEmbeddingsModel,
		names,
		defaults.embeddingsModel
	);
}

/**
 * Ask the Rust backend to health-check both servers and start whichever is
 * down. Servers already running (started by the app earlier or externally) are
 * left untouched.
 */
export async function ensureLlamaServers(restart = false): Promise<LlamaServerStatus[]> {
	await reconcileLlamaModels();
	try {
		const statuses = await invoke<LlamaServerStatus[]>('ensure_llama_servers', {
			config: {
				modelsDir: viewState.llamaModelsDir,
				inference: {
					model: viewState.llamaInferenceModel,
					port: viewState.llamaInferencePort
				},
				embeddings: {
					model: viewState.llamaEmbeddingsModel,
					port: viewState.llamaEmbeddingsPort
				},
				restart
			}
		});

		viewState.llamaServersStatus = statuses;

		const inference = statuses.find((status) => status.name === 'inference');
		if (inference) viewState.inferenceServiceUp = inference.error ? false : inference.healthy;
		const embeddings = statuses.find((status) => status.name === 'embeddings');
		if (embeddings) viewState.embeddingsServiceUp = embeddings.error ? false : embeddings.healthy;

		return statuses;
	} catch (error) {
		console.warn('[llama] failed to ensure servers', error);
		return [];
	}
}
