import { primaryColor } from "@/stores/uiStore";
import { viewState } from "@/stores/viewStore.svelte";
import type { Task } from "@/types/taskRunner.types";
import { taskRunner } from "@/runners/taskRunner.svelte";
import { getArticleWithTasksByUrl, type ArticleWithTasks } from "@/stores/tasksStore";
import { youTubeRunner } from "@/runners/youtube/youTubeRunner";
import { extractProfileRunner } from "@/runners/youtube/profileVideosRunner";
import { deleteArticleByUrl } from "@/stores/tasksStore";

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
const YOUTUBE_PROFILE_VIDEOS_REGEX = /youtube\.com\/@[\w-]+\/videos/;


type UrlRouteCondition = RegExp | ((url: string) => boolean);

type UrlRouteHandlerContext = {
	cachedArticle?: ArticleWithTasks | null;
};

type UrlRoute = {
	name: string;
	condition: UrlRouteCondition;
	handler: (url: string, context?: UrlRouteHandlerContext) => Promise<Task[]>;
};

function matchesRoute(url: string, condition: UrlRouteCondition): boolean {
	if (condition instanceof RegExp) {
		return condition.test(url);
	}

	return condition(url);
}

const routeDefinitions: UrlRoute[] = [
	{
		name: "youtubeVideo",
		condition: YOUTUBE_URL_REGEX,
		handler: (url, context) => youTubeRunner(url, undefined, context?.cachedArticle),
	},
	{
		name: "toubeProfileVideos",
		condition: YOUTUBE_PROFILE_VIDEOS_REGEX,
		handler: extractProfileRunner,
	},
];

function findRoute(url: string): UrlRoute | undefined {
	return routeDefinitions.find((route) => matchesRoute(url, route.condition));
}

// Allows external modules to register new routes with either regex or custom condition logic.
export function addUrlRoute(route: UrlRoute) {
	routeDefinitions.push(route);
}

function applyCachedArticle(cached: ArticleWithTasks) {
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

type UrlRouterOptions = {
	forceRunTasks?: boolean;
};

export async function urlRouter(
	url: string,
	{ forceRunTasks = false }: UrlRouterOptions = {},
): Promise<RouterResult> {
	if (inProgressRequests.has(url)) {
		return inProgressRequests.get(url) as Promise<RouterResult>;
	}

	// Si forceRunTasks es true, limpiar completamente el cache
	if (forceRunTasks) {
		inMemoryCache.delete(url);
		await deleteArticleByUrl(url); 
	}

	// First: check in-memory cache (very fast)
	if (!forceRunTasks && inMemoryCache.has(url)) {
		const cached = inMemoryCache.get(url) as ArticleWithTasks;
		applyCachedArticle(cached);
		return { data: cached, cached: true };
	}

	let cachedArticle: ArticleWithTasks | null = null;

	if (!forceRunTasks) {
		cachedArticle = await getArticleWithTasksByUrl(url);

		viewState.primaryColor = cachedArticle?.mainColor || viewState.primaryColor;

		if (cachedArticle) {
			inMemoryCache.set(url, cachedArticle);
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
			const matchingRoute = findRoute(url);

			if (!matchingRoute) {
				const supportedRoutes = routeDefinitions.map((route) => route.name).join(", ");
				throw new Error(`Unsupported URL. Supported routes: ${supportedRoutes}.`);
			}

			const tasks = await matchingRoute.handler(url, { cachedArticle });
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
