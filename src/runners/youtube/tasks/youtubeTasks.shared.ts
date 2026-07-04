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
	SUMMARY = 'summary',
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

export const defaultCompletionOptions = {
	model: 'llama-server',
	temperature: 0.8,
	min_p: 0.0,
	presence_penalty: 1.5,
	repetition_penalty: 1.0,
	stream: true
} as const;
