// ============================================================================
// Language Types (shared with external TTS service via TTSComponent.svelte)
// ============================================================================

export const AVAILABLE_LANGUAGES = ['en', 'ko', 'es', 'pt', 'fr'] as const;
export type TTSLanguage = (typeof AVAILABLE_LANGUAGES)[number];

export function isValidLanguage(lang: string): lang is TTSLanguage {
	return AVAILABLE_LANGUAGES.includes(lang as TTSLanguage);
}
