import { viewState } from '@/stores/viewStore.svelte';
import type { Task } from '@/types/taskRunner.types';
import {
	deleteArticleByUrl,
	getArticleWithTasksByUrl,
	type ArticleWithTasks
} from '@/stores/webStore';
import { youTubeRunner } from '@/runners/youtube/youTubeRunner';
import { profileRunner } from '@/runners/youtube/profileVideosRunner';
import { webRunner } from '@/runners/web/webRunner';
import { workflowManager } from '@/runners/workflowManager.svelte';

type RouterResult = { data: { url: string | null; tasks?: Task[] }; cached: boolean };

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
		handler: (url, context) =>
			youTubeRunner(url, {
				runnerConfig: { cached: context?.cachedArticle, routine: 'fromUrl' }
			})
	},
	{
		name: 'youtubeProfileVideos',
		condition: YOUTUBE_PROFILE_VIDEOS_REGEX,
		handler: (url) =>
			profileRunner(url, {
				runnerConfig: { routine: 'fromVideo', makeActive: true },
				options: { videosAmount: 10 }
			})
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

export function addUrlRoute(route: UrlRoute) {
	routeDefinitions.push(route);
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
				viewState.url = cachedArticle.url ?? '';
			} else {
				viewState.url = url;
			}
			if (!cachedArticle) {
				viewState.loading = true;
				viewState.loaded = false;
			}

			const tasks = await matchingRoute.handler(url, { cachedArticle });

			if (!cachedArticle) {
				viewState.loaded = true;
				viewState.loading = false;
			}

			return { data: { url, tasks }, cached: Boolean(cachedArticle) };
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
