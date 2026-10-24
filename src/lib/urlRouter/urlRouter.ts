/**
 * URL routing.
 *
 * The router no longer owns any pipeline: it detects what kind of url it is
 * and delegates to the article manager, which owns the queue and the runs.
 */
import { viewState } from '@/stores/viewStore.svelte';
import { articleManager } from '@/runners/articleManager.svelte';
import { deleteArticleByUrl } from '@/stores/webStore';
import { normalizeYouTubeUrl } from '@/lib/utils/youtube/helpers';
import { detectSource } from '@/runners/articleSources';
import type { ArticleMode } from '@/types/articleAnalysis.types';

type RouterResult = { data: { url: string | null }; cached: boolean };

const inProgressRequests = new Map<string, Promise<RouterResult>>();

const YOUTUBE_URL_REGEX = /(youtube\.com\/watch\?v=|youtu\.be\/)/;
const YOUTUBE_PROFILE_VIDEOS_REGEX = /youtube\.com\/@[\w-]+\/videos/;

type UrlRouterOptions = {
	/** Destructive refresh: the article is deleted and processed again. */
	forceRunTasks?: boolean;
	/** Mode of the run. `metadata` captures the article without analysing it. */
	mode?: ArticleMode;
	/** Body of a raw article. */
	rawText?: string;
};

export async function urlRouter(
	url: string,
	{ forceRunTasks = false, mode = 'full', rawText }: UrlRouterOptions = {}
): Promise<RouterResult> {
	if (YOUTUBE_URL_REGEX.test(url)) {
		url = normalizeYouTubeUrl(url);
	}

	if (inProgressRequests.has(url)) {
		return inProgressRequests.get(url) as Promise<RouterResult>;
	}

	const inFlight: Promise<RouterResult> = (async () => {
		try {
			// A channel page is not an article: it scrapes the channel and
			// enqueues its videos in `metadata` mode.
			if (YOUTUBE_PROFILE_VIDEOS_REGEX.test(url)) {
				const { scrapStore } = await import('@/stores/scrapStore.svelte');
				const handle = extractChannelHandle(url);
				await scrapStore.fetchMissingProfileVideos(handle);
				return { data: { url }, cached: false };
			}

			if (forceRunTasks) {
				await deleteArticleByUrl(url);
			}

			const source = detectSource(url);

			if (mode === 'metadata' && source !== 'raw') {
				// A capture-only run: the card is stored and the article is
				// analysed when it is opened. The user stays where they are,
				// so the view loading flags are not touched (the manager
				// reports the queue activity on the topbar instead).
				articleManager.enqueue(url, { mode: 'metadata' });
				return { data: { url }, cached: false };
			}

			viewState.url = url;
			viewState.loaded = false;
			viewState.loading = true;

			if (source === 'raw') {
				// A raw article carries its text with it: there is nothing to
				// fetch, only to analyse. `open` initializes the store and
				// forwards the body to the queued run.
				await articleManager.open(url, { mode, rawText });
			} else {
				await articleManager.open(url);
			}

			// `loading` must always fall here: `open` resolves at enqueue
			// time (the run continues in the manager's queue), and leaving
			// it up would route every later paste into the silent enqueue
			// branch. `loaded` is raised either by `open` (already analysed)
			// or when the queued run ends.
			viewState.loading = false;

			return { data: { url }, cached: false };
		} catch (err) {
			console.error('Error while routing URL:', err);
			viewState.loading = false;
			viewState.loaded = false;
			throw err;
		} finally {
			inProgressRequests.delete(url);
		}
	})();

	inProgressRequests.set(url, inFlight);
	return inFlight;
}

/** Extracts the `@handle` of a YouTube channel url. */
function extractChannelHandle(url: string): string {
	try {
		const parsed = new URL(url);
		const segments = parsed.pathname.split('/').filter(Boolean);
		const handle = segments.find((segment) => segment.startsWith('@'));
		return handle ?? segments[0] ?? '';
	} catch {
		return url;
	}
}
