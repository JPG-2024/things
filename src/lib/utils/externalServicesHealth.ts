import { viewState } from '@/stores/viewStore.svelte';
import { createAdaptivePoller } from '@/lib/utils/adaptivePoller';
import { getTTSApiKey } from '@/lib/utils/ttsAuth';

const SCRAPER_API_URL = import.meta.env.VITE_SCRAPER_API_URL ?? 'http://localhost:3003';
const TTS_API_URL = import.meta.env.VITE_TTS_API_URL;
const WHISPER_API_URL = import.meta.env.VITE_WHISPER_API_URL;

export type ExternalServiceName = 'scrap' | 'tts' | 'whisper';

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

/**
 * Probe a service without assuming a dedicated health endpoint: `GET /health`
 * first, then a known route whose response status is irrelevant — any HTTP
 * reply (even 404/405 on a POST-only route) proves the server is up, while a
 * network error or timeout means it is down.
 */
async function probeService(baseUrl: string, fallbackPath: string): Promise<boolean> {
	const url = trimTrailingSlash(baseUrl);
	if (!url) return false;
	if (await fetchOk(`${url}/health`)) return true;
	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
		try {
			await fetch(`${url}${fallbackPath}`, { signal: controller.signal });
			return true;
		} finally {
			clearTimeout(timeout);
		}
	} catch {
		return false;
	}
}

/**
 * Check the scraper, TTS, and whisper services and sync the results into
 * `viewState` for the toolbar health dots.
 */
export async function refreshExternalServicesHealth(): Promise<void> {
	const [scrapUp, ttsUp, whisperUp] = await Promise.all([
		probeService(SCRAPER_API_URL, '/api/scrape'),
		probeService(TTS_API_URL, '/voices'),
		probeService(WHISPER_API_URL, '/speech')
	]);
	viewState.scrapServiceUp = scrapUp;
	viewState.ttsServiceUp = ttsUp;
	viewState.whisperServiceUp = whisperUp;

	// Verificar si se requiere autenticación para TTS
	if (ttsUp) {
		const key = await getTTSApiKey();
		viewState.ttsAuthRequired = !key;
	}
}

/**
 * Poll the three external services and mirror their health into `viewState`.
 * Adaptive: skips cycles while the window is hidden and backs off (15 → 30 →
 * 60 s) while any service is down. Returns a stop function for cleanup.
 */
export function startExternalServicesHealthPolling(): () => void {
	return createAdaptivePoller({
		intervalMs: POLL_INTERVAL_MS,
		maxIntervalMs: POLL_MAX_INTERVAL_MS,
		refresh: refreshExternalServicesHealth,
		isAllUp: () =>
			viewState.scrapServiceUp && viewState.ttsServiceUp && viewState.whisperServiceUp,
		label: 'external-services'
	});
}
