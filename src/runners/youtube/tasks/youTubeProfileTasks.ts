import { invoke } from "@tauri-apps/api/core";
import { downloadImageUrl } from "@/lib/utils/files";
import { getArticlesByUrls } from "@/stores/tasksStore";
import { getYouTubeThumbnailUrl } from "@/lib/utils/youtube";

import {
	buildVideoPageParams,
	getRequiredTaskState,
	TaskNames,
	type GetChannelVideosContext,
	type YouTubeTaskRegistrySubset,
} from "./youtubeTasks.shared";
import { youTubeRunner } from "../youTubeRunner";

type ProfileTaskIds =
	| TaskNames.INIT
	| TaskNames.THUMBNAIL
	| TaskNames.GET_CHANNEL_VIDEOS
	| TaskNames.EXTRACT_CHANNEL_VIDEOS
	| TaskNames.EXTRACT_PROFILE;

export const profileTaskRegistry: YouTubeTaskRegistrySubset<ProfileTaskIds> = {
	[TaskNames.INIT]: (runnerOptions) => ({
		id: TaskNames.INIT,
		name: "Initialize YouTube Context",
		dependencies: [],
		type: "script",
		run: () => {
			const urlObj = new URL(runnerOptions.url);
			const videoId = urlObj.searchParams.get("v");

			console.log("INIT task - URL:", runnerOptions);

			return {
				url: runnerOptions.url,
				videoId,
				language: runnerOptions.language,
			};
		},
	}),

	[TaskNames.THUMBNAIL]: () => ({
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
			} = await downloadImageUrl(ytThumbnailUrl, profile);

			return {
				mediaDirectory,
				thumbnailImage,
				thumbnailImageSrc,
				videoId: urlData.videoId,
			};
		},
	}),

	[TaskNames.EXTRACT_PROFILE]: () => ({
		id: TaskNames.EXTRACT_PROFILE,
		dependencies: [TaskNames.INIT],
		type: "script",
		run: async ({ state }) => {
			const context = getRequiredTaskState(state, TaskNames.INIT);

			const result = await invoke<{ profile: string[] }>("get_page_elements", {
				...buildVideoPageParams(context.url),
				selectors: [
					{
						name: "profile",
						selector: "div.ytPageHeaderViewModelHeadline",
					},
				],
				attempts: 5,
				intervalMs: 200,
			});

			return result.profile[1];
		},
	}),

	[TaskNames.GET_CHANNEL_VIDEOS]: () => ({
		id: TaskNames.GET_CHANNEL_VIDEOS,
		name: "Get channel videos",
		dependencies: [TaskNames.INIT],
		type: "script",
		run: async ({ state }) => {
			const urlData = getRequiredTaskState(state, TaskNames.INIT);
			const profileInfo = await invoke<GetChannelVideosContext>(
				"get_page_elements",
				{
					url: String(urlData.url),
					selectors: [
						{ name: "channelName", selector: "h1 > span" },
						{
							name: "channelPicSrc",
							selector: "yt-avatar-shape img",
							attribute: "src",
						},
						{
							name: "videoIds",
							selector: "a#video-title-link",
							attribute: "href",
						},
					],
					attempts: 5,
					interval_ms: 2000,
				}
			);

			return profileInfo;
		},
	}),

	[TaskNames.EXTRACT_CHANNEL_VIDEOS]: () => ({
		id: TaskNames.EXTRACT_CHANNEL_VIDEOS,
		name: "Extract channel videos",
		dependencies: [TaskNames.GET_CHANNEL_VIDEOS],
		type: "script",
		run: async ({ runId, state }) => {
			const { videoIds } = getRequiredTaskState(
				state,
				TaskNames.GET_CHANNEL_VIDEOS
			);

			const profile = getRequiredTaskState(state, TaskNames.EXTRACT_PROFILE);

			const fullUrls = videoIds.map((id) => `https://www.youtube.com${id}`);
			const urlsToProcess = fullUrls.slice(0, 3);
			const existingArticles = await getArticlesByUrls(urlsToProcess);

			console.log(fullUrls, existingArticles);

			const existingArticlesByUrl = new Map(
				existingArticles
					.filter((article) => typeof article.url === "string")
					.map((article) => [article.url as string, article])
			);

			console.log("Existing articles by URL:", existingArticlesByUrl);

			const results = [];

			for (const url of urlsToProcess) {
				if (existingArticlesByUrl.has(url)) {
					continue;
				}

				results.push(
					await youTubeRunner(url, null, {
						makeActive: false,
						parentRunId: runId,
						routine: "videoItem",
						profile,
					})
				);
			}

			return { fullUrls, results };
		},
	}),
};
