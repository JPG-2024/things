import { LANG_NAMES } from '@/constants';
import { splitByLevels } from '@/lib/utils/splitText';
import { splitThoughtTags } from '@/lib/utils/reasoningTags';
import { nextWindowDivisor, WINDOW_DIVISOR_LADDER } from '@/lib/utils/windowAnalysis';
import { isContextSizeError } from '@/runners/shared/contextSizeError';

export async function translateText(text: string, targetLang: string): Promise<string> {
	const { chatCompletions } = await import('@/lib/utils/inference/chat-completions-provider');
	const { viewState } = await import('@/stores/viewStore.svelte');
	const langName = LANG_NAMES[targetLang] ?? targetLang;
	const response = await chatCompletions({
		model: viewState.aiModel,
		stream: false,
		// Explicit 'none' (like the analysis/title tasks): only a request-level
		// field reliably becomes chat_template_kwargs.enable_thinking = false,
		// so the translation stays exempt even with the global --reasoning on.
		reasoning_effort: 'none',
		temperature: 0.1,
		messages: [
			{
				role: 'system',
				content: `Translate the following text to ${langName}. Return only the translated text, nothing else.`
			},
			{ role: 'user', content: text }
		]
	});
	const rawContent = response.choices?.[0]?.message?.content ?? text;
	return typeof rawContent === 'string' ? rawContent : text;
}

/** One translation call over a chunk of text; returns the translated chunk. */
export type TranslationCompletionFn = (
	text: string,
	langName: string,
	signal?: AbortSignal
) => Promise<string>;

export interface TranslateMarkdownOptions {
	signal?: AbortSignal;
	/** Called after each chunk is translated (1/1 on the single-request path). */
	onProgress?: (done: number, total: number) => void;
	/** Completion function; defaults to the app provider (imported lazily). */
	complete?: TranslationCompletionFn;
}

/**
 * Session-only cache so toggling languages back and forth never re-runs the
 * LLM. Capped: entries are whole article bodies, evicted oldest-first.
 */
const translationCache = new Map<string, string>();
const TRANSLATION_CACHE_MAX = 32;

function cacheTranslation(key: string, value: string): void {
	if (translationCache.size >= TRANSLATION_CACHE_MAX) {
		const oldest = translationCache.keys().next().value;
		if (oldest !== undefined) translationCache.delete(oldest);
	}
	translationCache.set(key, value);
}

function markdownSystemPrompt(langName: string): string {
	return (
		`Translate the following markdown text to ${langName}. ` +
		'Preserve the markdown structure exactly: headings, lists, links, tables, emphasis and code blocks. ' +
		'Do not translate code, URLs or markdown syntax. ' +
		'Return only the translated markdown, nothing else.'
	);
}

/**
 * The app completion call. The imports are lazy so this module stays
 * importable without the inference stack (the tests inject their own
 * completion function).
 */
async function defaultTranslateCompletion(
	text: string,
	langName: string,
	signal?: AbortSignal
): Promise<string> {
	const { chatCompletions } = await import('@/lib/utils/inference/chat-completions-provider');
	const { viewState } = await import('@/stores/viewStore.svelte');
	const response = await chatCompletions(
		{
			model: viewState.aiModel,
			stream: false,
			// Explicit 'none' (like the analysis/title tasks): only a request-level
			// field reliably becomes chat_template_kwargs.enable_thinking = false,
			// so the translation stays exempt even with the global --reasoning on.
			reasoning_effort: 'none',
			temperature: 0.1,
			// The target language is the prompt's own; the app-language suffix
			// would contradict it.
			skipLanguageSuffix: true,
			messages: [
				{ role: 'system', content: markdownSystemPrompt(langName) },
				{ role: 'user', content: text }
			]
		},
		{ signal }
	);
	const raw = response.choices?.[0]?.message?.content;
	if (typeof raw !== 'string') return text;
	return splitThoughtTags(raw).content.trim() || text;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
	if (signal?.aborted) {
		throw new DOMException('Aborted', 'AbortError');
	}
}

/**
 * Translates a markdown body, keeping its structure. The whole text is tried
 * in a single request first; on context overflow the run climbs the
 * window-divisor ladder (`1 → 2 → 4 → 8 → 16`) and translates the chunks
 * sequentially (the local llama-server is single threaded). Chunks are split
 * with zero overlap — unlike analysis windows, the results are concatenated,
 * so any overlap would duplicate text.
 */
export async function translateMarkdown(
	text: string,
	targetLang: string,
	options: TranslateMarkdownOptions = {}
): Promise<string> {
	const trimmed = text.trim();
	if (!trimmed) return text;

	const cacheKey = `${targetLang}\u0000${text}`;
	const cached = translationCache.get(cacheKey);
	if (cached !== undefined) return cached;

	const langName = LANG_NAMES[targetLang] ?? targetLang;
	const complete = options.complete ?? defaultTranslateCompletion;
	let divisor: number = WINDOW_DIVISOR_LADDER[0];

	while (true) {
		try {
			const chunks = splitByLevels(trimmed, divisor).map((chunk) => chunk.text);
			const parts: string[] = [];
			for (const [index, chunk] of chunks.entries()) {
				throwIfAborted(options.signal);
				parts.push(await complete(chunk, langName, options.signal));
				options.onProgress?.(index + 1, chunks.length);
			}
			const result = parts.join('\n\n');
			cacheTranslation(cacheKey, result);
			return result;
		} catch (error) {
			// An abort is not an overflow: rethrow it untouched.
			if (error instanceof Error && error.name === 'AbortError') throw error;

			if (!isContextSizeError(error)) throw error;
			const next = nextWindowDivisor(divisor);
			if (next === undefined) throw error;
			divisor = next;
		}
	}
}
