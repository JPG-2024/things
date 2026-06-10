// ============================================================================
// Language Types (shared with external TTS service via TTSComponent.svelte)
// ============================================================================

import { ttsState } from '@/stores/ttsStore.svelte';
import { getArticleWithTasksByUrl } from '@/stores/webStore';

export const AVAILABLE_LANGUAGES = ['en', 'ko', 'es', 'pt', 'fr'] as const;
export type TTSLanguage = (typeof AVAILABLE_LANGUAGES)[number];

export function isValidLanguage(lang: string): lang is TTSLanguage {
	return AVAILABLE_LANGUAGES.includes(lang as TTSLanguage);
}

export async function generateTTSfromArticleURL(url: string): Promise<void> {
	if (!url) return;
	const article = await getArticleWithTasksByUrl(url);
	const titleSummaryTask = article?.persistedTasks?.find((t) => t.id === 'title-summary');
	if (!titleSummaryTask?.data) {
		throw new Error('No title-summary data found for this article');
	}
	ttsState.setTextContents([titleSummaryTask.data as string]);
	const response = await ttsState.generateTTS(url);
	return response;
}
