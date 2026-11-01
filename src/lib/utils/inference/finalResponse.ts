import { stripThinkBlocks } from '@/lib/utils/inference/assistant-text';
import { sanitizeTitle } from '@/lib/utils/inference/titleText';

/** Horizontal rules a reasoner model emits between its trace and the answer. */
const SEPARATOR_LINE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;

/** Explicit "here is the answer" markers some chat templates emit. */
const ANSWER_MARKER = /^\s*(?:final\s+answer|final\s+response|answer)\s*[::]\s*/i;

const MAX_TITLE_WORDS = 20;
const MAX_TITLE_CHARS = 120;

/**
 * Keep only the final response of a model turn.
 *
 * Reasoner models that ignore the per-request thinking switch produce a
 * thinking trace followed by the actual answer, usually after a horizontal
 * rule (`---`). The trace is never wanted as task output, so everything up to
 * and including the last separator is dropped.
 * @param text - Raw assistant text.
 * @returns The final response, or empty string when the turn never reached one.
 */
export function stripFinalResponse(text: string): string {
	const withoutThinking = stripThinkBlocks(text);
	if (!withoutThinking.trim()) return '';

	const lines = withoutThinking.split('\n');

	let start = 0;
	for (let i = lines.length - 1; i >= 0; i--) {
		if (SEPARATOR_LINE.test(lines[i])) {
			start = i + 1;
			break;
		}
	}

	let answer = lines.slice(start).join('\n').trim();

	// An explicit marker beats the separator: take the text right after it.
	const marked = answer
		.split('\n')
		.filter((line) => ANSWER_MARKER.test(line))
		.pop();
	if (marked) {
		answer = marked.replace(ANSWER_MARKER, '').trim();
	}

	// A title is a single line; drop anything the model appended below it.
	const firstLine = answer.split('\n').find((line) => line.trim().length > 0) ?? '';
	return firstLine.trim();
}

/**
 * Parse the per-window questions out of a raw model response.
 *
 * The request asks for structured output (`response_format` json_schema), but
 * the guarantee is provider-dependent: llama converts the schema to a grammar,
 * OpenRouter forwards it to compatible models, and OpenCode may ignore it.
 * So the parser is defensive: keep only the final response, then extract the
 * first balanced JSON object anywhere in the text and validate its shape
 * against the count the window was asked for.
 * @param text - Raw assistant text for the questions task.
 * @param expectedCount - Number of questions the request asked for.
 * @returns Exactly `expectedCount` trimmed questions, or `null` when nothing
 * usable remains.
 */
export function parseQuestionsResponse(text: string, expectedCount: number): string[] | null {
	// Not `stripFinalResponse`: that helper keeps only the first line, while a
	// JSON answer spans several. Dropping thinking blocks is enough; the JSON
	// extractor below does the rest.
	const response = stripThinkBlocks(text);
	if (!response.trim()) return null;

	const start = response.indexOf('{');
	if (start === -1) return null;

	// Walk the string so an object containing a brace inside a string value
	// still closes at the right place.
	let depth = 0;
	let end = -1;
	let inString = false;
	let escaped = false;
	for (let i = start; i < response.length; i++) {
		const char = response[i];
		if (inString) {
			if (escaped) escaped = false;
			else if (char === '\\') escaped = true;
			else if (char === '"') inString = false;
			continue;
		}
		if (char === '"') inString = true;
		else if (char === '{') depth++;
		else if (char === '}') {
			depth--;
			if (depth === 0) {
				end = i + 1;
				break;
			}
		}
	}
	if (end === -1) return null;

	try {
		const parsed = JSON.parse(response.slice(start, end)) as { questions?: unknown };
		const questions = parsed?.questions;
		if (!Array.isArray(questions)) return null;
		const cleaned = questions
			.filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
			.map((q) => q.trim());
		return cleaned.length === expectedCount ? cleaned : null;
	} catch {
		return null;
	}
}

/**
 * Parse a title out of a raw model response.
 *
 * Keeps only the final response of the turn, then delegates the shaping to the
 * shared `sanitizeTitle` (wrappers, punctuation, word/character budget).
 * @param text - Raw assistant text for the title task.
 * @param maxWords - Maximum words to keep.
 * @returns The sanitized title, or empty string when there is nothing usable.
 */
export function parseTitleText(text: string, maxWords = MAX_TITLE_WORDS): string {
	const response = stripFinalResponse(text);
	if (!response) return '';
	return sanitizeTitle(response, { maxWords, maxChars: MAX_TITLE_CHARS });
}
