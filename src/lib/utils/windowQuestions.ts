import type { WindowPayload } from '@/types/articleAnalysis.types';

/** Questions a window is asked for: 2, plus 1 per each 10k chars, capped. */
const BASE_QUESTIONS = 2;
const QUESTIONS_PER_10K_CHARS = 1;
const MAX_QUESTIONS = 5;

/**
 * Bigger windows answer more questions: the count grows with the chunk size,
 * so a whole-article window (÷1) yields more than a sliver of the ÷16 ladder.
 */
export function questionsForChunk(chunk: string): number {
	return Math.min(
		MAX_QUESTIONS,
		BASE_QUESTIONS + Math.floor(chunk.length / 10_000) * QUESTIONS_PER_10K_CHARS
	);
}

/**
 * The questions a window answers, for rendering.
 *
 * The `questions` key of the open `WindowPayload` is only present on windows
 * analysed after the questions call existed and only when the call succeeded,
 * so the shape is validated here instead of trusted: anything that is not an
 * array of non-empty strings yields an empty list.
 */
export function readWindowQuestions(data: WindowPayload): string[] {
	const questions = data.questions;
	if (!Array.isArray(questions)) return [];
	return questions
		.filter((q): q is string => typeof q === 'string')
		.map((q) => q.trim())
		.filter((q) => q.length > 0);
}
