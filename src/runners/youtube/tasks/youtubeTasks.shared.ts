import type { TTSLanguage } from '$lib/utils/tts';

export type PageElementItem = {
	name: string;
	selector: string;
	textContent: string | null;
};

export type InitContext = {
	url: string;
	videoId: string | null;
	language: TTSLanguage;
};

export type YouTubePlayerContext = {
	mediaDirectory: string;
	thumbnailImage: string;
	thumbnailImageSrc: string;
	videoId: string;
	url: string;
};

export type ChapterContext = {
	chapterCaptions: Array<{ title: string; content: string }>;
};

export enum TaskNames {
	INIT_YOUTUBE_PROFILE = 'init-youtube-profile',
	INIT_YOUTUBE_VIDEO = 'init-youtube-video',
	THUMBNAIL = 'thumbnail',
	MAIN_COLOR = 'main-color',
	SUMMARY = 'summary',
	EXTRACT_CHANNEL_VIDEOS = 'extract-channel-videos',
	KEYWORDS = 'keywords',
	KEYPOINTS = 'key-points',
	CHAPTERS = 'chapters',
	CHAPTERS_SUMMARY = 'chapters-summary',
	TIMED_CAPTIONS = 'timed-captions',
	CONTENT = 'content',
	VIDEO_INFO = 'video-info',
	TITLE_SUMMARY = 'title-summary',
	TITLE = 'title',
	EXTRACT_PROFILE = 'extract-profile',
	PROFILE_FROM_VIDEO = 'profile-from video',
	GENERATE_TTS = 'waveing...',
	CATEGORY = 'category',
	PROFILE_CATEGORY = 'profile-category'
}

export type YouTubeTaskFactoryContext = {
	url: string;
	language: TTSLanguage;
	freshRun: boolean;
	profileId?: string;
	videosAmount?: number;
};

export const defaultCompletionOptions = {
	model: 'llama-server',
	temperature: 0.8,
	min_p: 0.0,
	presence_penalty: 1.5,
	repetition_penalty: 1.0,
	stream: true
} as const;

export function buildVideoPageParams(url: string) {
	return {
		url,
		attempts: 5,
		intervalMs: 2000
	};
}
