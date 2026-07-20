import type { TTSLanguage } from '$lib/utils/tts';

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

export enum TaskNames {
	INIT_YOUTUBE_PROFILE = 'init-youtube-profile',
	INIT_YOUTUBE_VIDEO = 'init-youtube-video',
	THUMBNAIL = 'thumbnail',
	MAIN_COLOR = 'main-color',
	KEYWORDS = 'keywords',
	KEYPOINTS = 'key-points',
	TIMED_CAPTIONS = 'timed-captions',
	CONTENT = 'content',
	TITLE_SUMMARY = 'title-summary',
	TITLE = 'title',
	GENERATE_TTS = '〰',
	CATEGORY = 'category',
	EMOJIS = 'emojis'
}

export type YouTubeTaskFactoryContext = {
	url: string;
	language: TTSLanguage;
	freshRun: boolean;
	profileId?: string;
	videosAmount?: number;
};
