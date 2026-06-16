import { viewState } from '@/stores/viewStore.svelte';
import type { Task } from '@/types/taskRunner.types';
import { deleteArticleByUrl, getTasksByUrl, type PersistedTaskState } from '@/stores/webStore';
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
	cachedTasks?: PersistedTaskState[] | null;
	runnerOptions?: Record<string, unknown>;
	routine?: string;
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
				runnerConfig: { cachedTasks: context?.cachedTasks, routine: 'fromUrl' }
			})
	},
	{
		name: 'youtubeProfileVideos',
		condition: YOUTUBE_PROFILE_VIDEOS_REGEX,
		handler: (url, context) =>
			profileRunner(url, {
				runnerConfig: {
					cachedTasks: context?.cachedTasks,
					routine: context?.routine ?? 'fromVideo',
					makeActive: true
				},
				options: { videosAmount: 10, ...context?.runnerOptions }
			})
	},
	{
		name: 'defaultBlog',
		condition: () => true,
		handler: (url, context) => webRunner(url, context?.cachedTasks)
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
	runnerOptions?: Record<string, unknown>;
	routine?: string;
};

export async function urlRouter(
	url: string,
	{ forceRunTasks = false, runnerOptions, routine }: UrlRouterOptions = {}
): Promise<RouterResult> {
	workflowManager.clearStack();

	if (inProgressRequests.has(url)) {
		return inProgressRequests.get(url) as Promise<RouterResult>;
	}

	const inFlight: Promise<RouterResult> = (async () => {
		let cachedTasks: PersistedTaskState[] | null = null;
		try {
			const matchingRoute = findRoute(url);

			if (!matchingRoute) {
				const supportedRoutes = routeDefinitions.map((route) => route.name).join(', ');
				throw new Error(`Unsupported URL. Supported routes: ${supportedRoutes}.`);
			}

			if (forceRunTasks) {
				await deleteArticleByUrl(url);
			} else {
				cachedTasks = await getTasksByUrl(url);
			}

			viewState.url = url;
			if (!cachedTasks) {
				viewState.loading = true;
				viewState.loaded = false;
			}

			const tasks = await matchingRoute.handler(url, {
				cachedTasks,
				runnerOptions,
				routine
			});

			if (!cachedTasks) {
				viewState.loaded = true;
				viewState.loading = false;
			}

			return { data: { url, tasks }, cached: Boolean(cachedTasks) };
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
