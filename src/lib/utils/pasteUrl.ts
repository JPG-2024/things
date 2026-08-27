import { viewState } from '@/stores/viewStore.svelte';
import { musicState } from '@/stores/musicStore.svelte';
import { navigate, extractUrlList } from '@/lib/utils/url';
import { urlRouter } from '@/lib/urlRouter/urlRouter';
import { rawRunner } from '@/runners/raw/rawRunner';
import { enrichRawWithUrl } from '@/lib/utils/enrichRawWithUrl';
import { articleCacheStore } from '@/stores/articleCacheStore.svelte';
import { RAW_PROCESS_LIMIT } from '@/constants';
import { playCoinSound, playCoinLostSound } from '@/lib/utils/coinSound';

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
		const clipboardToken = content.trim();
		viewState.lastHandledClipboardUrl = clipboardToken;

		if (viewState.downloadTracksEnabled) {
			musicState.addToQueue(urlList);
			return;
		}

		const capacity = Math.max(0, viewState.maxUrlQueueSize - viewState.urlQueue.length);

		if (viewState.processingUrl || viewState.loading) {
			viewState.urlQueue.push(...urlList.slice(0, capacity));
			return;
		}

		const [firstUrl, ...restUrls] = urlList;
		viewState.urlQueue.push(...restUrls.slice(0, capacity));
		try {
			await handlePasteUrl(firstUrl, { replaceState });
		} finally {
			viewState.lastHandledClipboardUrl = clipboardToken;
		}
		return;
	}

	const validUrl = extractValidUrl(content);

	if (validUrl && viewState.downloadTracksEnabled) {
		viewState.lastHandledClipboardUrl = validUrl;
		musicState.addToQueue([validUrl]);
		return;
	}

	if (viewState.processingUrl) return;

	if (validUrl && viewState.isRawMode) {
		viewState.processingUrl = true;
		try {
			viewState.lastHandledClipboardUrl = validUrl;
			await enrichRawWithUrl(viewState.url!, validUrl);
			articleCacheStore.invalidate();
		} finally {
			viewState.processingUrl = false;
			await processQueue({ replaceState });
		}
		return;
	}

	if (validUrl) {
		playCoinSound();
		viewState.processingUrl = true;
		try {
			viewState.lastHandledClipboardUrl = validUrl;
			navigate(`/youtube/${encodeURIComponent(validUrl)}`, { replaceState });
			await urlRouter(validUrl);
			articleCacheStore.invalidate();
		} finally {
			viewState.processingUrl = false;
			await processQueue({ replaceState });
		}
		return;
	}

	const trimmed = content.trim();
	if (!trimmed || trimmed.length < RAW_PROCESS_LIMIT) return;

	viewState.processingUrl = true;
	const rawId = `raw-${Date.now()}`;

	try {
		viewState.lastHandledClipboardUrl = trimmed;
		viewState.url = rawId;
		viewState.loading = true;
		viewState.loaded = false;
		navigate(`/raw/${rawId}`, { replaceState });
		await rawRunner(rawId, trimmed);
		articleCacheStore.invalidate();
	} finally {
		playCoinLostSound();
		viewState.loaded = true;
		viewState.loading = false;
		viewState.processingUrl = false;
		await processQueue({ replaceState });
	}
}

export async function processQueue(options?: { replaceState?: boolean }): Promise<void> {
	while (viewState.urlQueue.length > 0) {
		const nextUrl = viewState.urlQueue.shift();
		if (!nextUrl) break;
		await handlePasteUrl(nextUrl, { ...options, replaceState: true });
	}
}
