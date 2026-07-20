import type { TTSLanguage } from '$lib/utils/tts';

export enum WebTaskNames {
	INIT_WEB_CONTEXT = 'init-web-context',
	EXTRACT_WEB_PROFILE = 'extract-web-profile',
	METADATA = 'metadata',
	THUMBNAIL = 'thumbnail',
	MAIN_COLOR = 'main-color',
	TITLE = 'title',
	CONTENT = 'content',
	TITLE_SUMMARY = 'title-summary',
	KEYWORDS = 'keywords',
	KEYPOINTS = 'key-points',
	GENERATE_TTS = '〰',
	CATEGORY = 'CATEGORY'
}

export type WebTaskFactoryContext = {
	url: string;
	language: TTSLanguage;
	freshRun: boolean;
};
