/**
 * Window analysis — the only analytic of the MVP article runner.
 *
 * The article body is split into windows, every window is summarized with one
 * LLM call (plus a short title call for its label) and the window summaries
 * are merged with one more call. When the
 * context of the model overflows, the run climbs the window-divisor ladder
 * (`1 → 2 → 4 → 8 → 16`) and the level it *actually* executed is reported
 * back, so the caller can store it instead of deducing it.
 */
import { splitByLevels, splitByMarkdownHeaders } from '@/lib/utils/splitText';
import { isContextSizeError } from '@/runners/shared/contextSizeError';
import type { ArticleWindow } from '@/types/articleAnalysis.types';

export { reconstructChunks } from '@/lib/utils/splitText';

/** Window divisors the ladder can climb through. */
export const WINDOW_DIVISOR_LADDER = [1, 2, 4, 8, 16] as const;
export const MAX_WINDOW_DIVISOR = WINDOW_DIVISOR_LADDER[WINDOW_DIVISOR_LADDER.length - 1];

/** A section longer than this is sub-split even in heading mode. */
const TARGET_CHUNK_SIZE = 15000;

/** Overlap between two consecutive windows, as a ratio of the window size. */
export const WINDOW_OVERLAP_RATIO = 0.1;

/**
 * Default slider position: two windows over the article.
 *
 * Index into `WINDOW_DIVISOR_LADDER`, so it maps to a divisor of 2.
 */
export const DEFAULT_WINDOW_LEVEL = 1;

/** One slice of the article body, before it is summarized. */
export interface WindowSlice {
	text: string;
	startOffset: number;
	endOffset: number;
	/** Section heading the slice belongs to, when the split was heading-aware. */
	heading?: string;
}

/** Options of a single analysis run. */
export interface AnalyzeWindowsOptions {
	/**
	 * Window divisor to start with. `null` splits by markdown headings
	 * instead (the web behaviour): no knob, no clamp.
	 */
	divisor: number | null;
	/** Splits by markdown headings instead of by level. */
	splitByHeaders?: boolean;
	/** Model used for the summarization calls. */
	model?: string;
	/**
	 * Called once per attempt, before its first window.
	 *
	 * The split is already known at that point, so the total is available from
	 * the very start of the run — and an attempt that climbs the divisor ladder
	 * restarts with a fresh total. Listeners use it to reset their buffer: one
	 * attempt owns the windows it streams, so two attempts can never coexist.
	 */
	onAttempt?: (total: number) => void;
	/** Called after every window is summarized, to stream progress. */
	onWindow?: (window: ArticleWindow, index: number, total: number) => void;
}

/** Result of an analysis run. */
export interface AnalyzeWindowsResult {
	windows: ArticleWindow[];
	summary: string;
	/** The divisor that was actually executed; `null` in heading mode. */
	divisor: number | null;
}

/** Next rung of the ladder, or `undefined` when the ladder is exhausted. */
export function nextWindowDivisor(divisor: number): number | undefined {
	return WINDOW_DIVISOR_LADDER.find((rung) => rung > divisor);
}

/**
 * Clamps a slider position to the ladder. Out-of-range values fall back to
 * the default level instead of throwing: the knob is a preference, not an
 * invariant.
 */
export function clampWindowLevel(level: number | undefined): number {
	if (level === undefined || !Number.isFinite(level)) return DEFAULT_WINDOW_LEVEL;

	const index = Math.trunc(level);
	if (index < 0) return 0;
	if (index >= WINDOW_DIVISOR_LADDER.length) return WINDOW_DIVISOR_LADDER.length - 1;

	return index;
}

/** Slider position that matches a divisor, or `null` when it is not on the ladder. */
export function windowLevelForDivisor(divisor: number | null): number | null {
	if (divisor === null) return null;
	const index = WINDOW_DIVISOR_LADDER.indexOf(divisor as (typeof WINDOW_DIVISOR_LADDER)[number]);
	return index === -1 ? null : index;
}

/**
 * Splits the body into windows.
 *
 * Heading mode mirrors the previous web behaviour: one window per markdown
 * section, and a section longer than `TARGET_CHUNK_SIZE` is sub-split (its
 * divisor is derived from its size, not from the ladder). Level mode divides
 * the body into `divisor` windows with a small overlap.
 */
export function splitArticleIntoWindows(
	content: string,
	options: { divisor: number | null; splitByHeaders?: boolean }
): WindowSlice[] {
	if (options.splitByHeaders || options.divisor === null) {
		return splitByHeaders(content);
	}

	const divisor = Math.max(1, Math.trunc(options.divisor));
	const overlap = Math.floor((content.length / divisor) * WINDOW_OVERLAP_RATIO);

	return splitByLevels(content, divisor, overlap).map((chunk) => ({
		text: chunk.text,
		startOffset: chunk.startOffset,
		endOffset: chunk.endOffset
	}));
}

function splitByHeaders(content: string): WindowSlice[] {
	const headerChunks = splitByMarkdownHeaders(content);
	const slices: WindowSlice[] = [];

	for (const chunk of headerChunks) {
		if (chunk.text.length > TARGET_CHUNK_SIZE) {
			const divisor = Math.ceil(chunk.text.length / TARGET_CHUNK_SIZE);
			for (const sub of splitByLevels(chunk.text, divisor)) {
				slices.push({
					text: sub.text,
					// A heading describes the whole section, so every sub-chunk
					// inherits it — not just the one containing the heading line.
					heading: chunk.heading,
					startOffset: sub.startOffset,
					endOffset: sub.endOffset
				});
			}
			continue;
		}

		slices.push({
			text: chunk.text,
			heading: chunk.heading,
			startOffset: chunk.startOffset,
			endOffset: chunk.endOffset
		});
	}

	return slices;
}

/**
 * Summarizes every window of the body and merges the results.
 *
 * On a context-overflow error the run restarts with the next rung of the
 * ladder. Heading mode has no ladder (the divisor is unknown there), so a
 * context error propagates.
 */
export async function analyzeWindows(
	content: string,
	options: AnalyzeWindowsOptions
): Promise<AnalyzeWindowsResult> {
	// The processor is imported lazily so the pure helpers of this module (the
	// split and the ladder) stay importable without the inference stack.
	const { windowSummaryProcessor } = await import('@/runners/shared/processors');
	const processor = windowSummaryProcessor.build({
		model: options.model
	});
	let divisor = options.divisor;

	while (true) {
		try {
			const slices = splitArticleIntoWindows(content, {
				divisor,
				splitByHeaders: options.splitByHeaders
			});

			const windows: ArticleWindow[] = [];
			options.onAttempt?.(slices.length);
			for (const [index, slice] of slices.entries()) {
				const result = await processor.processChunk(slice.text, index);
				const window: ArticleWindow = {
					index,
					start: slice.startOffset,
					end: slice.endOffset,
					data: {
						summary: result.summary,
						...(result.title ? { title: result.title } : {})
					}
				};
				windows.push(window);
				options.onWindow?.(window, index, slices.length);
			}

			const combined = await processor.combineChunks(windows.map((w) => w.data));

			return { windows, summary: combined.summary, divisor };
		} catch (error) {
			if (!isContextSizeError(error) || divisor === null || divisor === undefined) {
				throw error;
			}

			const next = nextWindowDivisor(divisor);
			if (next === undefined) {
				throw error;
			}

			divisor = next;
		}
	}
}
