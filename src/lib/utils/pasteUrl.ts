import type { QueryClient } from '@tanstack/svelte-query';
import { viewState } from '@/stores/viewStore.svelte';
import { navigate } from '@/lib/utils/url';
import { urlRouter } from '@/lib/urlRouter/urlRouter';
import { rawRunner } from '@/runners/raw/rawRunner';
import { enrichRawWithUrl } from '@/lib/utils/enrichRawWithUrl';

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
	queryClient: QueryClient;
	replaceState?: boolean;
};

export async function handlePasteUrl(
	content: string,
	{ queryClient, replaceState = false }: HandlePasteUrlOptions
): Promise<void> {
	if (viewState.processingUrl) return;

	const validUrl = extractValidUrl(content);

	if (validUrl && viewState.isRawMode) {
		viewState.processingUrl = true;
		try {
			viewState.lastHandledClipboardUrl = validUrl;
			await enrichRawWithUrl(viewState.url!, validUrl);
			queryClient.invalidateQueries({ queryKey: ['profiles'] });
			queryClient.invalidateQueries({ queryKey: ['articles'] });
		} finally {
			viewState.processingUrl = false;
			await processQueue(queryClient);
		}
		return;
	}

	if (validUrl) {
		viewState.processingUrl = true;
		try {
			viewState.lastHandledClipboardUrl = validUrl;
			navigate(`/youtube/${encodeURIComponent(validUrl)}`, { replaceState });
			await urlRouter(validUrl);
			queryClient.invalidateQueries({ queryKey: ['profiles'] });
			queryClient.invalidateQueries({ queryKey: ['articles'] });
		} finally {
			viewState.processingUrl = false;
			await processQueue(queryClient);
		}
		return;
	}

	const trimmed = content.trim();
	if (!trimmed) return;

	viewState.processingUrl = true;
	const rawId = `raw-${Date.now()}`;

	try {
		viewState.lastHandledClipboardUrl = trimmed;
		viewState.url = rawId;
		viewState.loading = true;
		viewState.loaded = false;
		navigate(`/raw/${rawId}`, { replaceState });
		await rawRunner(rawId, trimmed);
		queryClient.invalidateQueries({ queryKey: ['profiles'] });
		queryClient.invalidateQueries({ queryKey: ['articles'] });
	} finally {
		viewState.loaded = true;
		viewState.loading = false;
		viewState.processingUrl = false;
		await processQueue(queryClient);
	}
}

export async function processQueue(queryClient: QueryClient): Promise<void> {
	while (viewState.urlQueue.length > 0) {
		const nextUrl = viewState.urlQueue.shift();
		if (!nextUrl) break;
		await handlePasteUrl(nextUrl, { queryClient, replaceState: true });
	}
}
