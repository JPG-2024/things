import { primaryColor } from "@/stores/uiStore";
import { viewState } from "@/stores/viewStore.svelte";
import type { Task } from "@/types/taskRunner.types";
import { taskRunner } from "@/stores/taskRunner.svelte";
import { getArticleCacheMap, type ArticleWithPlayerTask } from "@/stores/tasksStore";

import { youTubeRunner } from "@/runners/youTubeRunner";

// In-memory cache for quick session-level lookup and to avoid duplicate fetches
type RouterCachedArticle = {
	url: string | null;
	mainColor?: string | null;
	tasks?: Task[];
	[key: string]: unknown;
};

type RouterResult = { data: RouterCachedArticle; cached: boolean };

const inMemoryCache = new Map<string, RouterCachedArticle>();
// Map of in-flight requests to prevent concurrent duplicate work
const inProgressRequests = new Map<string, Promise<RouterResult>>();

const YOUTUBE_URL_REGEX = /(youtube\.com\/watch\?v=|youtu\.be\/)/;

function applyCachedArticle(cached: ArticleWithPlayerTask) {
	viewState.cleanAllState();
	viewState.url = cached.url ?? "";
	viewState.setAllValues(cached as unknown as Article);
	viewState.loaded = true;
	viewState.loading = false;
	if (cached.mainColor) {
		primaryColor.set(cached.mainColor as string);
	}
	taskRunner.setTasks(cached.tasks ?? []);
}

async function fillCacheFromDb() {
	const dbCache = await getArticleCacheMap();
	for (const [cachedUrl, article] of dbCache.entries()) {
		inMemoryCache.set(cachedUrl, article);
	}
}

type UrlRouterOptions = {
	forceInFlight?: boolean;
};

export async function urlRouter(
	url: string,
	{ forceInFlight = false }: UrlRouterOptions = {},
): Promise<RouterResult> {
	if (inProgressRequests.has(url)) {
		return inProgressRequests.get(url) as Promise<RouterResult>;
	}

	// First: check in-memory cache (very fast)
	if (!forceInFlight && inMemoryCache.has(url)) {
		const cached = inMemoryCache.get(url) as ArticleWithPlayerTask;
		applyCachedArticle(cached);
		return { data: cached, cached: true };
	}

	if (!forceInFlight) {
		await fillCacheFromDb();

		const cachedArticle = inMemoryCache.get(url) as ArticleWithPlayerTask | undefined;
		if (cachedArticle) {
			applyCachedArticle(cachedArticle);
			return { data: cachedArticle, cached: true };
		}
	}

	viewState.cleanAllState();
	viewState.url = url;
	viewState.loading = true;
	viewState.loaded = false;

	const inFlight: Promise<RouterResult> = (async () => {
		try {
			if (!YOUTUBE_URL_REGEX.test(url)) {
				throw new Error("Unsupported URL. Only YouTube URLs are handled by urlRouter.");
			}

			const tasks = await youTubeRunner(url);
			const freshData: RouterCachedArticle = {
				...viewState.getAllValues(),
				url,
				tasks,
			};

			inMemoryCache.set(url, freshData);

			viewState.loaded = true;
			viewState.loading = false;

			return { data: freshData, cached: false };
		} catch (err) {
			console.error("Error while routing URL:", err);
			viewState.loading = false;
			viewState.loaded = false;
			throw err;
		} finally {
			inProgressRequests.delete(url);
		}
	})();

	inProgressRequests.set(url, inFlight);
	const result = await inFlight;

	return result;
}

// Helpers to clear in-memory caches (useful for debugging or when deleting articles)
export function clearUrlCache(url: string) {
	inMemoryCache.delete(url);
}

export function removeArticleFromCache(url: string) {
	inMemoryCache.delete(url);
	inProgressRequests.delete(url);
}

export function clearAllUrlCaches() {
	inMemoryCache.clear();
	inProgressRequests.clear();
}
