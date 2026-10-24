/**
 * Pasting a url.
 *
 * The queue lives in the article manager: there is a single notion of "urls
 * waiting to be processed".
 */
import { viewState } from '@/stores/viewStore.svelte';
import { articleManager } from '@/runners/articleManager.svelte';
import { articleCacheStore } from '@/stores/articleCacheStore.svelte';
import { urlRouter } from '@/lib/urlRouter/urlRouter';
import { extractUrlList, navigate } from '@/lib/utils/url';
import { playCoinSound, playCoinLostSound } from '@/lib/utils/coinSound';
import { RAW_PROCESS_LIMIT } from '@/constants';

const HTTP_URL_REGEX = /^https?:\/\/\S+$/i;

export function extractValidUrl(value: string): string | null {
	const trimmedValue = value.trim();

	if (!trimmedValue || !HTTP_URL_REGEX.test(trimmedValue)) {
		return null;
	}

	try {
		const parsedUrl = new URL(trimmedValue);
		if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
			return null;
		}

		return parsedUrl.toString();
	} catch {
		return null;
	}
}

type HandlePasteUrlOptions = {
	replaceState?: boolean;
};

export async function handlePasteUrl(
	content: string,
	{ replaceState = false }: HandlePasteUrlOptions = {}
): Promise<void> {
	const urlList = extractUrlList(content);

	if (urlList.length > 1) {
		// Several urls: the first one is processed, the rest are queued.
		const [firstUrl, ...restUrls] = urlList;
		restUrls.forEach((url) => articleManager.enqueue(url));
		await handlePasteUrl(firstUrl, { replaceState });
		return;
	}

	const validUrl = extractValidUrl(content);

	if (viewState.processingUrl) return;

	if (validUrl) {
		playCoinSound();
		viewState.processingUrl = true;
		try {
			// The capture-only mode keeps the user on the dashboard: the article
			// is captured in the background and analysed when it is opened. The
			// manager invalidates the article cache when the run finishes.
			if (viewState.captureOnlyOnPaste && isDashboardRoute()) {
				articleManager.enqueue(validUrl, { mode: 'metadata' });
				return;
			}

			navigate(`/youtube/${encodeURIComponent(validUrl)}`, { replaceState });
			await urlRouter(validUrl);
			articleCacheStore.invalidate();
		} finally {
			viewState.processingUrl = false;
		}
		return;
	}

	const trimmed = content.trim();
	if (!trimmed || trimmed.length < RAW_PROCESS_LIMIT) return;

	viewState.processingUrl = true;
	const rawId = `raw-${Date.now()}`;

	try {
		viewState.url = rawId;
		viewState.loading = true;
		viewState.loaded = false;
		navigate(`/raw/${rawId}`, { replaceState });
		await urlRouter(rawId, { rawText: trimmed });
		articleCacheStore.invalidate();
	} finally {
		playCoinLostSound();
		viewState.loaded = true;
		viewState.loading = false;
		viewState.processingUrl = false;
	}
}

/** True when the user is on the dashboard route. */
function isDashboardRoute(): boolean {
	if (typeof window === 'undefined') return false;
	return window.location.pathname === '/';
}
