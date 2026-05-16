import { invoke } from '@tauri-apps/api/core';
import { downloadImageUrl } from '@/lib/utils/files';
import { getArticlesByProfile } from '@/stores/tasksStore';
import { getYouTubeThumbnailUrl } from '@/lib/utils/youtube';
import { removeYTPpParam } from '@/lib/utils/youtube/helpers';

import {
	buildVideoPageParams,
	getRequiredTaskState,
	TaskNames,
	type GetChannelVideosContext,
	type YouTubeTaskRegistrySubset
} from './youtubeTasks.shared';
import { youTubeRunner } from '../youTubeRunner';

type ProfileTaskIds =
	| TaskNames.INIT
	| TaskNames.THUMBNAIL
	| TaskNames.EXTRACT_PROFILE
	| TaskNames.EXTRACT_CHANNEL_VIDEOS
	| TaskNames.GET_CHANNEL_VIDEOS;

export const profileTaskRegistry: YouTubeTaskRegistrySubset<ProfileTaskIds> = {
	[TaskNames.INIT]: (runnerOptions) => ({
		id: TaskNames.INIT,
		name: 'Initialize YouTube Context',
		dependencies: [],
		type: 'script',
		run: () => {
			const urlObj = new URL(runnerOptions.url);
			const videoId = urlObj.searchParams.get('v');

			return {
				url: runnerOptions.url,
				videoId,
				language: runnerOptions.language
			};
		}
	}),

	/* 	[TaskNames.THUMBNAIL]: () => ({
		id: TaskNames.THUMBNAIL,
		dependencies: [TaskNames.INIT, TaskNames.EXTRACT_PROFILE],
		type: "script",
		component: "player",
		run: async ({ state }) => {
			const urlData = getRequiredTaskState(state, TaskNames.INIT);
			const profile = getRequiredTaskState(state, TaskNames.EXTRACT_PROFILE);

			if (!urlData.videoId) {
				throw new Error("Video ID not found in URL");
			}

			const ytThumbnailUrl = getYouTubeThumbnailUrl(urlData.videoId);

			const {
				mediaDirectory,
				fileName: thumbnailImage,
				imageSrc: thumbnailImageSrc,
			} = await downloadImageUrl(ytThumbnailUrl, profile.name);

			return {
				mediaDirectory,
				thumbnailImage,
				thumbnailImageSrc,
				videoId: urlData.videoId,
			};
		},
	}), */

	[TaskNames.EXTRACT_PROFILE]: () => ({
		id: TaskNames.EXTRACT_PROFILE,
		dependencies: [TaskNames.INIT],
		type: 'script',
		run: async ({ state }) => {
			const context = getRequiredTaskState(state, TaskNames.INIT);

			const result = await invoke<{ profile: string[]; profilePicture: string[] }>(
				'get_page_elements',
				{
					...buildVideoPageParams(context.url),
					selectors: [
						{
							name: 'profile',
							selector: 'div.ytPageHeaderViewModelHeadline'
						},
						{
							name: 'profilePicture',
							selector: 'div#contentContainer img[src]',
							attribute: 'src'
						}
					],
					attempts: 5,
					intervalMs: 500
				}
			);

			const profile = {
				name: result.profile[1],
				profilePicture: result.profilePicture
			};

			return profile;
		}
	}),

	[TaskNames.GET_CHANNEL_VIDEOS]: () => ({
		id: TaskNames.GET_CHANNEL_VIDEOS,
		name: 'Get channel videos',
		dependencies: [TaskNames.INIT],
		type: 'script',
		run: async ({ state }) => {
			const urlData = getRequiredTaskState(state, TaskNames.INIT);
			const profileInfo = await invoke<GetChannelVideosContext>('get_page_elements', {
				url: String(urlData.url),
				selectors: [
					{ name: 'channelName', selector: 'h1 > span' },
					{
						name: 'profilePicture',
						selector: 'div#page-header img',
						attribute: 'src'
					},
					{
						name: 'videoIds',
						selector: 'a.ytLockupViewModelContentImage',
						attribute: 'href'
					}
				],
				attempts: 5,
				intervalMs: 2000
			});

			return profileInfo;
		}
	}),

	[TaskNames.EXTRACT_CHANNEL_VIDEOS]: () => ({
		id: TaskNames.EXTRACT_CHANNEL_VIDEOS,
		name: 'Extract channel videos',
		dependencies: [TaskNames.GET_CHANNEL_VIDEOS],
		type: 'script',
		run: async ({ runId, state }) => {
			const { videoIds } = getRequiredTaskState(state, TaskNames.GET_CHANNEL_VIDEOS);

			const fullUrls = videoIds.map((id) => `https://www.youtube.com${id}`);
			const urlsToProcess = fullUrls.slice(0, 5).reverse(); // Process in reverse order to prioritize newer videos
			urlsToProcess.forEach((url, index, arr) => {
				arr[index] = removeYTPpParam(url);
			});

			/* 
				const existingArticles = await getArticlesByProfile(profile, {
					limit: 50,
					createdAtFrom: Date.now() - 1000 * 60 * 60 * 24 * 30, // last 30 days
				});

				const existingArticlesByUrl = new Map(
					existingArticles
						.filter((article) => typeof article.url === "string")
						.map((article) => [article.url as string, article])
				);
			*/

			const results = [];

			for (const url of urlsToProcess) {
				const row = await invoke('get_stored_article_by_url', { url });

				if (row) {
					continue;
				}

				const profile = getRequiredTaskState(state, TaskNames.EXTRACT_PROFILE);

				results.push(
					await youTubeRunner(url, null, {
						makeActive: false,
						parentRunId: runId,
						routine: 'videoItem',
						profile: profile.name,
						profilePicture: profile.profilePicture
					})
				);
			}

			return { fullUrls, results };
		}
	})
};
