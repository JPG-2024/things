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
