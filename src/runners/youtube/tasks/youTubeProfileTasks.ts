import { invoke } from '@tauri-apps/api/core';
import { downloadImageUrl } from '@/lib/utils/files';
import { getArticlesByProfile, saveProfile, getProfile } from '@/stores/tasksStore';
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

const dateRegex = /\d{1,2}\s[a-zA-Z]+\s\d{4}/i;

type ProfileTaskIds =
	| TaskNames.INIT_YOUTUBE_PROFILE
	| TaskNames.EXTRACT_PROFILE
	| TaskNames.EXTRACT_CHANNEL_VIDEOS;

export const profileTaskRegistry: YouTubeTaskRegistrySubset<ProfileTaskIds> = {
	[TaskNames.INIT_YOUTUBE_PROFILE]: (runnerOptions) => ({
		id: TaskNames.INIT_YOUTUBE_PROFILE,
		name: 'Initialize YouTube Profile',
		dependencies: [],
		type: 'script',
		run: () => {
			const urlObj = new URL(runnerOptions.url);
			const profileId = runnerOptions.profileId || urlObj.pathname.split('/')[1];
			const url = `https://www.youtube.com/${profileId}/videos`;

			return {
				...runnerOptions,
				url,
				profileId
			};
		}
	}),

	[TaskNames.EXTRACT_PROFILE]: () => ({
		id: TaskNames.EXTRACT_PROFILE,
		dependencies: [TaskNames.INIT_YOUTUBE_PROFILE],
		type: 'script',
		run: async ({ state }) => {
			const { url, profileId } = getRequiredTaskState(state, TaskNames.INIT_YOUTUBE_PROFILE);

			const result = await invoke<any>('get_page_elements', {
				url,
				selectors: [
					{
						name: 'profile',
						selector: 'yt-content-metadata-view-model'
					},
					{ name: 'channelName', selector: 'h1 > span' },
					{
						name: 'profilePicture',
						selector: 'div#contentContainer img[src]',
						attribute: 'src'
					},
					{
						name: 'videoIds',
						selector: 'a.ytLockupViewModelContentImage',
						attribute: 'href'
					},
					{
						name: 'uploadDate',
						selector: 'div#info yt-formatted-string'
					}
				],
				attempts: 5,
				intervalMs: 500
			});

			const pictureUrl = Array.isArray(result.profilePicture)
				? result.profilePicture[1]
				: result.profilePicture;

			const downloadedImage = await downloadImageUrl(pictureUrl);

			const videoUrls = result.videoIds.map((id: string) => `https://www.youtube.com${id}`);

			// get last video date
			const firstVideoUrl = removeYTPpParam(videoUrls[0]);
			const videoInfo = await invoke<{ uploadDate: string[] }>('get_page_elements', {
				...buildVideoPageParams(firstVideoUrl),
				selectors: [
					{
						name: 'uploadDate',
						selector: 'div#info yt-formatted-string'
					}
				],
				attempts: 5,
				intervalMs: 200
			});

			let lastVideoDate =
				videoInfo.uploadDate.find((d) =>
					d.match(/^(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{4})$/i)
				) ?? 0;

			const date = new Date(lastVideoDate);
			lastVideoDate = date.toISOString().split('T')[0];

			const profile = {
				id: result.profile[0],
				name: result.channelName,
				profilePicture: downloadedImage.imageSrc,
				videoUrls
			};

			const existingProfile = await getProfile(profileId);

			if (!existingProfile) {
				await saveProfile(profileId, profile.profilePicture, lastVideoDate);
			}

			return profile;
		}
	}),

	[TaskNames.EXTRACT_CHANNEL_VIDEOS]: () => ({
		id: TaskNames.EXTRACT_CHANNEL_VIDEOS,
		name: 'Extract channel videos',
		dependencies: [TaskNames.EXTRACT_PROFILE],
		type: 'script',
		run: async ({ runId, state }) => {
			const { videoUrls } = getRequiredTaskState(state, TaskNames.EXTRACT_PROFILE); // TODO define types
			const { videosAmount, profileId } = getRequiredTaskState(
				state,
				TaskNames.INIT_YOUTUBE_PROFILE
			); // TODO

			// START PROCESSING VIDEOS
			const urlsToProcess = videoUrls.slice(0, videosAmount).reverse(); // Process in reverse order to prioritize newer videos
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

				results.push(
					await youTubeRunner(url, null, {
						makeActive: false,
						parentRunId: runId,
						routine: 'videoItem',
						profileId
					})
				);
			}

			return { videoUrls, results };
		}
	})
};
