import { downloadImageUrl } from '@/lib/utils/files';
import { getImageColor } from '@/lib/utils/getImageColor';
import { getYouTubeThumbnailUrl } from '@/lib/utils/youtube';
import { viewState } from '@/stores/viewStore.svelte';
import {
	getRequiredTaskState,
	TaskNames,
	type YouTubeTaskRegistrySubset
} from './youtubeTasks.shared';

type ContextTaskIds = TaskNames.INIT_YOUTUBE_VIDEO | TaskNames.THUMBNAIL | TaskNames.MAIN_COLOR;

function getProfileFromVideoInfo(videoInfo: unknown): string | null {
	if (typeof videoInfo !== 'object' || videoInfo === null) {
		return null;
	}

	const profile = (videoInfo as Record<string, unknown>).profile;
	if (typeof profile === 'string' && profile.trim()) {
		return profile;
	}

	if (Array.isArray(profile)) {
		const firstProfile = profile.find(
			(value): value is string => typeof value === 'string' && value.trim().length > 0
		);
		return firstProfile ?? null;
	}

	return null;
}

export const contextTaskRegistry: YouTubeTaskRegistrySubset<ContextTaskIds> = {
	[TaskNames.INIT_YOUTUBE_VIDEO]: (runnerOptions) => ({
		id: TaskNames.INIT_YOUTUBE_VIDEO,
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

	[TaskNames.THUMBNAIL]: () => ({
		id: TaskNames.THUMBNAIL,
		dependencies: [TaskNames.INIT_YOUTUBE_VIDEO],
		type: 'script',
		component: 'player',
		gridSpan: 1,
		run: async ({ state }) => {
			const urlData = getRequiredTaskState(state, TaskNames.INIT_YOUTUBE_VIDEO);

			if (!urlData.videoId) {
				throw new Error('Video ID not found in URL');
			}

			const ytThumbnailUrl = getYouTubeThumbnailUrl(urlData.videoId, 'high');

			const {
				mediaDirectory,
				fileName: thumbnailImage,
				imageSrc: thumbnailImageSrc
			} = await downloadImageUrl(ytThumbnailUrl);

			return {
				mediaDirectory,
				thumbnailImage,
				thumbnailImageSrc,
				videoId: urlData.videoId,
				url: urlData.url
			};
		}
	}),

	[TaskNames.MAIN_COLOR]: () => ({
		id: TaskNames.MAIN_COLOR,
		name: 'Get main color',
		dependencies: [TaskNames.THUMBNAIL],
		type: 'script',
		run: async ({ state }) => {
			const thumbnail = getRequiredTaskState(state, TaskNames.THUMBNAIL);

			let mainColor = '';
			try {
				mainColor = await getImageColor(thumbnail.thumbnailImageSrc || '');
				if (mainColor) {
					viewState.primaryColor = mainColor;
				}
			} catch (colorError) {
				console.error('Error extracting main color:', colorError);
			}

			return mainColor;
		}
	})
};
