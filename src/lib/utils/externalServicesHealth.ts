import { invoke } from '@tauri-apps/api/core';
import { viewState } from '@/stores/viewStore.svelte';
import { createAdaptivePoller } from '@/lib/utils/adaptivePoller';
import { getTTSApiKey } from '@/lib/utils/ttsAuth';
import { appLog, type LogModule } from '@/lib/utils/appLog';

const TTS_API_URL = import.meta.env.VITE_TTS_API_URL;
const WHISPER_API_URL = import.meta.env.VITE_WHISPER_API_URL;

export type ExternalServiceName = 'chromium' | 'tts' | 'whisper';

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
 * Whether the embedded YouTube scraper has a Chromium binary to drive. Local
 * and cheap: no process is launched, the Rust side only resolves the path.
 */
async function probeChromium(): Promise<boolean> {
	try {
		return await invoke<boolean>('youtube_browser_status');
	} catch {
		return false;
	}
}

/**
 * Check the scraper's Chromium, TTS, and whisper services and sync the results
 * into `viewState` for the toolbar health dots.
 */
export async function refreshExternalServicesHealth(): Promise<void> {
	const wasUp: Record<ExternalServiceName, boolean> = {
		chromium: viewState.scrapBrowserUp,
		tts: viewState.ttsServiceUp,
		whisper: viewState.whisperServiceUp
	};
	const [chromiumUp, ttsUp, whisperUp] = await Promise.all([
		probeChromium(),
		probeService(TTS_API_URL, '/voices'),
		probeService(WHISPER_API_URL, '/speech')
	]);
	viewState.scrapBrowserUp = chromiumUp;
	viewState.ttsServiceUp = ttsUp;
	viewState.whisperServiceUp = whisperUp;

	// Only transitions are logged: steady-state polls stay out of the log.
	const nowUp: Record<ExternalServiceName, boolean> = {
		chromium: chromiumUp,
		tts: ttsUp,
		whisper: whisperUp
	};
	const moduleOf: Record<ExternalServiceName, LogModule> = {
		chromium: 'capture',
		tts: 'tts',
		whisper: 'tts'
	};
	for (const name of Object.keys(nowUp) as ExternalServiceName[]) {
		if (nowUp[name] !== wasUp[name]) {
			appLog.info(moduleOf[name], `svc:${name} ${nowUp[name] ? 'up' : 'down'}`);
		}
	}

	// Verificar si se requiere autenticación para TTS
	if (ttsUp) {
		const key = await getTTSApiKey();
		viewState.ttsAuthRequired = !key;
	}
}

/**
 * Poll the external services (and the scraper's Chromium) and mirror their
 * health into `viewState`. Adaptive: skips cycles while the window is hidden
 * and backs off (15 → 30 → 60 s) while any service is down. Returns a stop
 * function for cleanup.
 */
export function startExternalServicesHealthPolling(): () => void {
	return createAdaptivePoller({
		intervalMs: POLL_INTERVAL_MS,
		maxIntervalMs: POLL_MAX_INTERVAL_MS,
		refresh: refreshExternalServicesHealth,
		isAllUp: () => viewState.scrapBrowserUp && viewState.ttsServiceUp && viewState.whisperServiceUp,
		label: 'external-services'
	});
}
