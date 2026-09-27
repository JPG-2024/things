import { viewState } from '@/stores/viewStore.svelte';

const EMBEDDINGS_URL = (import.meta.env.VITE_EMBEDDINGS_URL ?? 'http://localhost:8083').replace(
	/\/+$/,
	''
);
const POLL_INTERVAL_MS = 15000;
const REQUEST_TIMEOUT_MS = 4000;

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

async function checkHealth(): Promise<boolean> {
	if (await fetchOk(`${EMBEDDINGS_URL}/health`)) return true;
	return fetchOk(`${EMBEDDINGS_URL}/v1/models`);
}

export async function refreshEmbeddingsHealth(): Promise<boolean> {
	const up = await checkHealth();
	viewState.embeddingsServiceUp = up;
	return up;
}

/**
 * Poll the embeddings service health and mirror it into `viewState`.
 * Returns a stop function for cleanup.
 */
export function startEmbeddingsHealthPolling(): () => void {
	void refreshEmbeddingsHealth();
	const interval = setInterval(() => void refreshEmbeddingsHealth(), POLL_INTERVAL_MS);
	return () => clearInterval(interval);
}
