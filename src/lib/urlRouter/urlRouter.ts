import { primaryColor } from '@/stores/uiStore';
import { viewState } from '@/stores/viewStore.svelte';
import type { Task } from '@/types/taskRunner.types';
import {
	deleteArticleByUrl,
	getArticleWithTasksByUrl,
	type ArticleWithTasks
} from '@/stores/tasksStore';
import { youTubeRunner } from '@/runners/youtube/youTubeRunner';
import { extractProfileRunner } from '@/runners/youtube/profileVideosRunner';
import { webRunner } from '@/runners/web/webRunner';
import { workflowManager } from '@/runners/workflowManager.svelte';

// Router response payload built from the persisted article snapshot and current run
type RouterCachedArticle = {
	url: string | null;
	mainColor?: string | null;
	tasks?: Task[];
	[key: string]: unknown;
};

type RouterResult = { data: RouterCachedArticle; cached: boolean };

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
		name: 'youtubeVideo',
		condition: YOUTUBE_URL_REGEX,
		handler: (url, context) => youTubeRunner(url, context?.cachedArticle)
	},
	{
		name: 'toubeProfileVideos',
		condition: YOUTUBE_PROFILE_VIDEOS_REGEX,
		handler: extractProfileRunner
	},
	{
		name: 'defaultBlog',
		condition: () => true,
		handler: (url, context) => webRunner(url, context?.cachedArticle)
	}
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
	viewState.url = cached.url ?? '';
	viewState.setAllValues(cached as unknown as Article);
	viewState.loaded = true;
	viewState.loading = false;
	if (cached.mainColor) {
		viewState.primaryColor = cached.mainColor;
		primaryColor.set(cached.mainColor as string);
	}
}

type UrlRouterOptions = {
	forceRunTasks?: boolean;
};

export async function urlRouter(
	url: string,
	{ forceRunTasks = false }: UrlRouterOptions = {}
): Promise<RouterResult> {
	workflowManager.clearStack();

	if (inProgressRequests.has(url)) {
		return inProgressRequests.get(url) as Promise<RouterResult>;
	}

	const inFlight: Promise<RouterResult> = (async () => {
		let cachedArticle: ArticleWithTasks | null = null;
		try {
			const matchingRoute = findRoute(url);

			if (!matchingRoute) {
				const supportedRoutes = routeDefinitions.map((route) => route.name).join(', ');
				throw new Error(`Unsupported URL. Supported routes: ${supportedRoutes}.`);
			}

			if (forceRunTasks) {
				await deleteArticleByUrl(url);
			} else {
				cachedArticle = await getArticleWithTasksByUrl(url);
			}

			if (cachedArticle) {
				applyCachedArticle(cachedArticle);
				viewState.loading = true;
			} else {
				viewState.cleanAllState();
				viewState.url = url;
				viewState.loading = true;
				viewState.loaded = false;
			}

			const tasks = await matchingRoute.handler(url, { cachedArticle });
			const freshData: RouterCachedArticle = {
				...viewState.getAllValues(),
				url,
				tasks
			};

			viewState.loaded = true;
			viewState.loading = false;

			return { data: freshData, cached: Boolean(cachedArticle) };
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
	const result = await inFlight;

	return result;
}
