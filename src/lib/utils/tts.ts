import { ttsState } from '@/stores/ttsStore.svelte';
import { getArticleByUrl } from '@/stores/webStore';

export const AVAILABLE_LANGUAGES = ['en', 'ko', 'es', 'pt', 'fr'] as const;
export type TTSLanguage = (typeof AVAILABLE_LANGUAGES)[number];

export function isValidLanguage(lang: string): lang is TTSLanguage {
	return AVAILABLE_LANGUAGES.includes(lang as TTSLanguage);
}

export async function generateTTSfromArticleURL(url: string): Promise<void> {
	if (!url) return;
	const article = await getArticleByUrl(url);
	const summary = article?.summary;
	if (!summary) {
		throw new Error('No summary found for this article');
	}
	ttsState.setTextContents([summary]);
	const response = await ttsState.generateTTS(url);
	return response;
}
