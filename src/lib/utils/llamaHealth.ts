import { invoke } from '@tauri-apps/api/core';
import { viewState } from '@/stores/viewStore.svelte';
import { errorStore } from '@/stores/errorStore.svelte';
import { loadingStore } from '@/stores/loadingStore.svelte';
import { appLog } from '@/lib/utils/appLog';
import type {
	LlamaModelEntry,
	LlamaServerRuntime,
	LlamaServerStatus
} from '@/lib/utils/llamaModels';
import { SERVER_NAMES, type ServerName } from '@/lib/utils/llamaModels';
import { createAdaptivePoller } from '@/lib/utils/adaptivePoller';

export type { LlamaServerStatus, LlamaServerRuntime };

const POLL_INTERVAL_MS = 15000;
const POLL_MAX_INTERVAL_MS = 60000;
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
 * Check both llama-server instances and sync the result into `viewState`: the
 * plain service flags plus the full status list the Settings modal renders.
 */
export async function refreshLlamaHealth(): Promise<void> {
	const wasInferenceUp = viewState.inferenceServiceUp;
	const wasEmbeddingsUp = viewState.embeddingsServiceUp;
	const [inferenceUp, embeddingsUp] = await Promise.all([
		checkService(viewState.llamaBaseUrl),
		checkService(viewState.embeddingsBaseUrl)
	]);
	viewState.inferenceServiceUp = inferenceUp;
	viewState.embeddingsServiceUp = embeddingsUp;
	// Only transitions are logged: a steady state polled every 15 s must not
	// flood the durable log.
	if (inferenceUp !== wasInferenceUp) {
		appLog.info('inference', `llama:inference ${inferenceUp ? 'up' : 'down'}`);
	}
	if (embeddingsUp !== wasEmbeddingsUp) {
		appLog.info('inference', `llama:embeddings ${embeddingsUp ? 'up' : 'down'}`);
	}
	await syncLlamaServerStatus(inferenceUp, embeddingsUp);
}

/**
 * Merge HTTP health and app-owned process liveness into `llamaServersStatus`.
 * A healthy port may belong to a server started outside the app, so HTTP
 * health alone forces `running`; app ownership only explains a pid and the
 * "starting…" phase while the process loads the model.
 */
async function syncLlamaServerStatus(inferenceUp: boolean, embeddingsUp: boolean): Promise<void> {
	let runtime: LlamaServerRuntime[] = [];
	try {
		runtime = await invoke<LlamaServerRuntime[]>('llama_servers_runtime');
	} catch (error) {
		console.warn('[llama] failed to query server runtime', error);
	}
	const owned = new Map(runtime.map((entry) => [entry.name, entry]));
	const healthy: Record<ServerName, boolean> = {
		inference: inferenceUp,
		embeddings: embeddingsUp
	};
	const ports: Record<ServerName, number> = {
		inference: viewState.llamaInferencePort,
		embeddings: viewState.llamaEmbeddingsPort
	};

	viewState.llamaServersStatus = SERVER_NAMES.map((name) => {
		const existing = viewState.llamaServersStatus.find((entry) => entry.name === name);
		const ownedEntry = owned.get(name);
		const up = healthy[name];
		const ownedRunning = ownedEntry?.running ?? false;
		return {
			name,
			port: ports[name],
			running: up || ownedRunning,
			healthy: up,
			pid: ownedRunning ? (ownedEntry?.pid ?? existing?.pid ?? null) : null,
			error: up ? null : (existing?.error ?? null)
		} satisfies LlamaServerStatus;
	});
}

const BURST_ATTEMPTS = 10;
const BURST_INTERVAL_MS = 1500;
let burstPolling = false;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Refresh health repeatedly right after a start/restart so the UI moves from
 * "starting…" to "online" quickly instead of waiting for the 15 s poll.
 */
async function pollUntilHealthy(attempts = BURST_ATTEMPTS): Promise<void> {
	if (burstPolling) return;
	burstPolling = true;
	// One live entry per server that still has to come up; the float shows
	// "starting…" until the health probe answers (or the burst gives up).
	if (!viewState.inferenceServiceUp) {
		loadingStore.start('llama:inference', {
			source: 'backend',
			module: 'inference',
			label: 'Inference server',
			message: 'starting…'
		});
	}
	if (!viewState.embeddingsServiceUp) {
		loadingStore.start('llama:embeddings', {
			source: 'backend',
			module: 'inference',
			label: 'Embeddings server',
			message: 'starting…'
		});
	}
	try {
		for (let attempt = 0; attempt < attempts; attempt++) {
			await sleep(BURST_INTERVAL_MS);
			await refreshLlamaHealth();
			if (viewState.inferenceServiceUp) loadingStore.finish('llama:inference');
			if (viewState.embeddingsServiceUp) loadingStore.finish('llama:embeddings');
			if (viewState.inferenceServiceUp && viewState.embeddingsServiceUp) return;
		}
		if (!viewState.inferenceServiceUp) {
			loadingStore.fail('llama:inference', 'server did not become healthy');
		}
		if (!viewState.embeddingsServiceUp) {
			loadingStore.fail('llama:embeddings', 'server did not become healthy');
		}
	} finally {
		burstPolling = false;
	}
}

/**
 * Poll both services and mirror their health into `viewState`.
 * Adaptive: skips cycles while the window is hidden and backs off (15 → 30 →
 * 60 s) while either server is down. Returns a stop function for cleanup.
 */
export function startLlamaHealthPolling(): () => void {
	return createAdaptivePoller({
		intervalMs: POLL_INTERVAL_MS,
		maxIntervalMs: POLL_MAX_INTERVAL_MS,
		refresh: refreshLlamaHealth,
		isAllUp: () => viewState.inferenceServiceUp && viewState.embeddingsServiceUp,
		label: 'llama'
	});
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
	loadingStore.start('llama:ensure', {
		source: 'backend',
		module: 'inference',
		label: restart ? 'Restarting llama servers' : 'Starting llama servers'
	});
	try {
		const statuses = await invoke<LlamaServerStatus[]>('ensure_llama_servers', {
			config: {
				modelsDir: viewState.llamaModelsDir,
				inference: {
					model: viewState.llamaInferenceModel,
					port: viewState.llamaInferencePort
				},
				inferenceCtxSize: viewState.llamaInferenceCtxSize,
				cacheRamMb: viewState.llamaCacheRamMb,
				reasoning: viewState.llamaReasoning,
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

		loadingStore.finish('llama:ensure');
		void pollUntilHealthy();

		return statuses;
	} catch (error) {
		loadingStore.fail('llama:ensure', error instanceof Error ? error.message : String(error));
		// The health dots partially cover this, but a total autostart
		// failure must also reach the error center (warn: the app works,
		// the local models just are not running).
		errorStore.report(error, {
			feature: 'inference',
			userMessage: 'Failed to ensure the llama servers are running',
			level: 'warn'
		});
		return [];
	}
}

/**
 * Start only the servers that are down. Already-running servers are left
 * untouched.
 */
export async function startLlamaServers(): Promise<LlamaServerStatus[]> {
	return ensureLlamaServers(false);
}

/**
 * Kill only the servers the app itself spawned and mirror the stopped state.
 * Servers started outside the app are never affected.
 */
export async function stopLlamaServers(): Promise<void> {
	try {
		await invoke('stop_llama_servers', {
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
				restart: false
			}
		});
	} catch (error) {
		console.warn('[llama] failed to stop servers', error);
		return;
	}

	viewState.llamaServersStatus = viewState.llamaServersStatus.map((status) => ({
		...status,
		running: false,
		healthy: false,
		pid: null
	}));
	viewState.inferenceServiceUp = false;
	viewState.embeddingsServiceUp = false;
	loadingStore.remove('llama:inference');
	loadingStore.remove('llama:embeddings');
	appLog.info('inference', 'llama servers stopped');
}
