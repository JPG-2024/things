import type { TTSLanguage } from '$lib/utils/tts';

export enum WebTaskNames {
	INIT_WEB_CONTEXT = 'init-web-context',
	METADATA = 'metadata',
	THUMBNAIL = 'thumbnail',
	MAIN_COLOR = 'main-color',
	TITLE = 'title',
	CONTENT = 'content',
	TITLE_SUMMARY = 'title-summary',
	KEYWORDS = 'keywords',
	KEYPOINTS = 'key-points',
	GENERATE_TTS = '〰'
}

export type WebTaskFactoryContext = {
	url: string;
	language: TTSLanguage;
	freshRun: boolean;
};

export const defaultCompletionOptions = {
	model: 'llama-server',
	temperature: 0.7,
	top_p: 0.8,
	top_k: 20,
	min_p: 0.0,
	presence_penalty: 1.5,
	repetition_penalty: 1.0,
	stream: true
} as const;
