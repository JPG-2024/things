// ── Generic / fallback ────────────────────────────────────────────────
// Original: src/runners/shared/taskFactories.ts:26-27
export const DEFAULT_IA_SYSTEM_MESSAGE =
	'You are a helpful AI assistant. Respond concisely and accurately.';

// ── Emoji ─────────────────────────────────────────────────────────────
// Original: src/runners/shared/sharedTasks.ts:37-39
export const EMOJI_SYSTEM_MESSAGE =
	'Return exactly one emoji that best represents the user text. Respond with only the emoji and nothing else.';

// ── Category description ──────────────────────────────────────────────
// Original: src/runners/shared/sharedTasks.ts:62-64
export const CATEGORY_DESCRIPTION_SYSTEM_MESSAGE =
	'Write a short one-sentence description for the given category name. Respond with only the description, no quotes, no prefixes.';

// ── Summary (non-recursive / factory default) ─────────────────────────
// Original: src/runners/shared/taskFactories.ts:142-143
export const SUMMARY_SYSTEM_MESSAGE =
	'You are a professional content summarizer. Write a concise and clear summary.';
export const SUMMARY_USER_MESSAGE = 'Summarize the content.';

// ── Summary (recursive / processor) ───────────────────────────────────
// Original: src/runners/shared/processors/summarize.ts:21-23
export const RECURSIVE_SUMMARY_SYSTEM_MESSAGE =
	'You are a professional content summarizer. Write a concise and clear summary, only summary. no titles.';
// Original: src/runners/shared/processors/summarize.ts:9
export const RECURSIVE_SUMMARY_USER_MESSAGE =
	'Summarize this section concisely, only summary. no titles, no markdown';
// Original: src/runners/shared/processors/summarize.ts:10
export const RECURSIVE_SUMMARY_FINAL_USER_MESSAGE =
	'Combine these section summaries into a markdow summary. no title. use bold (**) to enfatize most relevant keywords, dont abuse.';

// ── Title ─────────────────────────────────────────────────────────────
// Original: src/runners/shared/taskFactories.ts:113
export const TITLE_SYSTEM_MESSAGE = 'Avoid Markdown.';

// Original: src/runners/shared/taskFactories.ts:116-119
export function buildTitleUserMessage(lang?: string): string {
	return `Create a short title describing the content. No more than 20 words. avoid quotes. Answer in ${lang === 'es' ? 'Spanish' : 'English'}.`;
}

// ── Category ──────────────────────────────────────────────────────────
// Original: src/runners/shared/taskFactories.ts:195-196
export function buildCategorySystemMessage(maxItems: number): string {
	const countPhrase = maxItems === 1 ? 'a single category name' : `${maxItems} category names`;
	return `You are a data extraction assistant. Return only a JSON array with exactly ${countPhrase}. No markdown, no explanations.`;
}

// Original: src/runners/shared/taskFactories.ts:198
export function buildCategoryUserMessage(maxItems: number, listedNames: string[]): string {
	const countPhrase = maxItems === 1 ? 'a category' : `${maxItems} categories`;
	return `Give ${countPhrase} from this ones: ${listedNames.join(', ')}.`;
}

// ── Extraction ────────────────────────────────────────────────────────
// Original: src/lib/utils/inference/extraction-helper.ts:7-8
export function buildExtractionSystemMessage(count: number, description: string): string {
	return `You are a data extraction assistant. Return only a JSON array of exactly ${count} ${description}. No markdown, no explanations.`;
}

// Original: src/lib/utils/inference/extraction-helper.ts:11-12
export function buildExtractionUserMessage(count: number, description: string): string {
	return `Extract ${count} ${description}. Respond in JSON format.`;
}

// ── Extraction (recursive / processor defaults) ───────────────────────
// Original: src/runners/shared/processors/extraction.ts:13-15
export const RECURSIVE_EXTRACTION_USER_MESSAGE = 'Extract items from this content.';
// Original: src/runners/shared/processors/extraction.ts:14-15
export const RECURSIVE_EXTRACTION_FINAL_USER_MESSAGE =
	'From this list of extracted items, pick the most relevant ones. Return a JSON array.';

// ── Translate ─────────────────────────────────────────────────────────
// Original: src/runners/shared/processors/translate.ts:24
export function buildTranslateSystemMessage(lang: string): string {
	return `Translate to ${lang}. Return only the translation, no explanations.`;
}

// Original: src/runners/shared/processors/translate.ts:9
export const TRANSLATE_USER_MESSAGE = 'Translate the following text.';
// Original: src/runners/shared/processors/translate.ts:10
export const TRANSLATE_FINAL_USER_MESSAGE = 'Combine these translations into a coherent text.';

// ── Custom ────────────────────────────────────────────────────────────
// Original: src/runners/shared/processors/custom.ts:9
export const CUSTOM_SYSTEM_MESSAGE = 'You are a helpful AI assistant.';
// Original: src/runners/shared/processors/custom.ts:10
export const CUSTOM_USER_MESSAGE = 'Process this content.';
// Original: src/runners/shared/processors/custom.ts:11
export const CUSTOM_FINAL_USER_MESSAGE = 'Combine the results into a coherent response.';

// ── Multi-field (combined summary + keywords + topics) ────────────────
export const MULTI_FIELD_SYSTEM_MESSAGE =
	'You are a data analysis assistant. Return ONLY a JSON object with keys "summary" (string), "keywords" (array of strings) and "topics" (array of strings). No markdown, no explanations.';

export function buildMultiFieldUserMessage(keywordCount: number, topicCount: number): string {
	return `Analyze this section. make a middle long summary, no titles. keywords: exactly ${keywordCount} specific keywords. explanatory topics: exactly ${topicCount} topic in 20 words each one. Respond in JSON.`;
}

export const MULTI_FIELD_FINAL_USER_MESSAGE =
	'Combine these section analyses into a single coherent result. For summary, merge into one markdown summary. For keywords and topics, deduplicate and keep the most relevant items. Respond in JSON with keys "summary", "keywords", "topics".';
