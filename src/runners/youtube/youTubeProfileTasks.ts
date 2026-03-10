import { invoke } from "@tauri-apps/api/core";
import { downloadImageUrl } from "@/lib/utils/files";
import { getYouTubeThumbnailUrl } from "@/lib/utils/youtube";
import { youTubeRunner } from "./youTubeRunner";

import {
	getRequiredTaskState,
	TaskNames,
	type GetChannelVideosContext,
	type YouTubeTaskRegistrySubset,
} from "./youtubeTasks.shared";

type ProfileTaskIds =
	| TaskNames.INIT
	| TaskNames.THUMBNAIL
	| TaskNames.GET_CHANNEL_VIDEOS
	| TaskNames.EXTRACT_CHANNEL_VIDEOS;

export const profileTaskRegistry: YouTubeTaskRegistrySubset<ProfileTaskIds> = {
	[TaskNames.INIT]: ({ url, language }) => ({
		id: TaskNames.INIT,
		name: "Initialize YouTube Context",
		dependencies: [],
		type: "script",
		run: () => {
			const urlObj = new URL(url);
			const videoId = urlObj.searchParams.get("v");

			return { url, videoId, language };
		},
	}),

	[TaskNames.THUMBNAIL]: () => ({
		id: TaskNames.THUMBNAIL,
		name: "Get thumbnail",
		dependencies: [TaskNames.INIT],
		type: "script",
		component: "player",
		run: async (state) => {
			const urlData = getRequiredTaskState(state, TaskNames.INIT);

			if (!urlData.videoId) {
				throw new Error("Video ID not found in URL");
			}

			const ytThumbnailUrl = getYouTubeThumbnailUrl(urlData.videoId);

			const {
				mediaDirectory,
				fileName: thumbnailImage,
				imageSrc: thumbnailImageSrc,
			} = await downloadImageUrl(ytThumbnailUrl);

			return {
				mediaDirectory,
				thumbnailImage,
				thumbnailImageSrc,
				videoId: urlData.videoId,
			};
		},
	}),

	[TaskNames.GET_CHANNEL_VIDEOS]: () => ({
		id: TaskNames.GET_CHANNEL_VIDEOS,
		name: "Get channel videos",
		dependencies: [TaskNames.INIT],
		type: "script",
		run: async (state) => {
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
		run: async (state) => {
			const { videoIds } = getRequiredTaskState(
				state,
				TaskNames.GET_CHANNEL_VIDEOS
			);
			const fullUrls = videoIds.map((id) => `https://www.youtube.com${id}`);

			const tasks = await youTubeRunner(fullUrls[0]);

			return fullUrls;
		},
	}),
};
