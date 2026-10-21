export function buildTranslateSystemMessage(lang: string): string {
	return `Translate to ${lang}. Return only the translation, no explanations.`;
}

export const TRANSLATE_USER_MESSAGE = 'Translate the following text.';

export const TRANSLATE_FINAL_USER_MESSAGE = 'Combine these translations into a coherent text.';
