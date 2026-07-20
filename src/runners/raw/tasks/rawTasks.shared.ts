import type { TTSLanguage } from '$lib/utils/tts';

export enum TaskNames {
	INIT_RAW_CONTEXT = 'init-raw-context',
	TITLE = 'title',
	CONTENT = 'content',
	TITLE_SUMMARY = 'title-summary',
	KEYWORDS = 'keywords',
	EMOJIS = 'emojis',
	CATEGORY = 'category',
	GENERATE_TTS = '〰'
}

export type TaskFactoryContext = {
	rawText: string;
	rawId: string;
	language: TTSLanguage;
	freshRun: boolean;
};
