import { invoke } from '@tauri-apps/api/core';
import type { Chapter, TimedCaption } from '@/lib/utils/youtube/joinCaptionsByChapters';
import {
	buildVideoPageParams,
	getRequiredTaskState,
	TaskNames,
	type PageElementItem,
	type YouTubeTaskRegistrySubset
} from './youtubeTasks.shared';

type CrawlTaskIds =
	| TaskNames.VIDEO_INFO
	| TaskNames.CHAPTERS
	| TaskNames.TIMED_CAPTIONS
	| TaskNames.CONTENT;

export const crawlTaskRegistry: YouTubeTaskRegistrySubset<CrawlTaskIds> = {
	[TaskNames.VIDEO_INFO]: () => ({
		id: TaskNames.VIDEO_INFO,
		dependencies: [TaskNames.INIT_YOUTUBE_VIDEO],
		component: 'videoInfo',
		gridSpan: 1,
		type: 'script',
		run: async ({ state }) => {
			const context = getRequiredTaskState(state, TaskNames.INIT_YOUTUBE_VIDEO);

			const videoInfo = await invoke<PageElementItem[]>('get_page_elements', {
				...buildVideoPageParams(context.url),
				selectors: [
					{ name: 'title', selector: '#title h1 yt-formatted-string' },
					{ name: 'views', selector: 'span.view-count' },
					{
						name: 'uploadDate',
						selector: 'div#info-strings yt-formatted-string'
					},
					{ name: 'profileId', selector: '#channel-name a', attribute: 'href' },
					{ name: 'profilePicture', selector: '#img ', attribute: 'src' }
				],
				attempts: 5,
				intervalMs: 200
			});

			videoInfo.profileId = videoInfo.profileId.slice(1);

			return videoInfo;
		}
	}),
	[TaskNames.CHAPTERS]: () => ({
		id: TaskNames.CHAPTERS,
		dependencies: [TaskNames.INIT_YOUTUBE_VIDEO],
		type: 'script',
		run: async ({ state }) => {
			const context = getRequiredTaskState(state, TaskNames.INIT_YOUTUBE_VIDEO);

			return invoke<Chapter[]>('extract_chapters', buildVideoPageParams(context.url));
		}
	}),
	[TaskNames.TIMED_CAPTIONS]: () => ({
		id: TaskNames.TIMED_CAPTIONS,
		name: 'Get timed captions',
		dependencies: [TaskNames.INIT_YOUTUBE_VIDEO],
		type: 'script',
		run: async ({ state }) => {
			const context = getRequiredTaskState(state, TaskNames.INIT_YOUTUBE_VIDEO);

			return invoke<TimedCaption[]>('get_youtube_transcript_timed', {
				id: context.videoId,
				language: context.language
			});
		}
	}),
	[TaskNames.CONTENT]: () => ({
		id: TaskNames.CONTENT,
		dependencies: [TaskNames.TIMED_CAPTIONS],
		component: 'ask',
		gridSpan: 3,
		type: 'script',
		persist: true,
		run: async ({ state }) => {
			const timedCaptions = getRequiredTaskState(state, TaskNames.TIMED_CAPTIONS);

			return timedCaptions
				.map((item) => item.caption)
				.join(' ')
				.trim();
		}
	})
};
