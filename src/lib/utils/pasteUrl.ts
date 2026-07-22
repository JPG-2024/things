import { viewState } from '@/stores/viewStore.svelte';
import { navigate } from '@/lib/utils/url';
import { urlRouter } from '@/lib/urlRouter/urlRouter';
import { rawRunner } from '@/runners/raw/rawRunner';
import { enrichRawWithUrl } from '@/lib/utils/enrichRawWithUrl';
import { articleCacheStore } from '@/stores/articleCacheStore.svelte';
import { RAW_PROCESS_LIMIT } from '@/constants';
import { playCoinSound } from '@/lib/utils/coinSound';

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
	if (viewState.processingUrl) return;

	const validUrl = extractValidUrl(content);

	debugger;

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
		playCoinSound();
		viewState.lastHandledClipboardUrl = trimmed;
		viewState.url = rawId;
		viewState.loading = true;
		viewState.loaded = false;
		navigate(`/raw/${rawId}`, { replaceState });
		await rawRunner(rawId, trimmed);
		articleCacheStore.invalidate();
	} finally {
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
