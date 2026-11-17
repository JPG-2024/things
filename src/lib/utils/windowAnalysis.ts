/**
 * Window analysis — the shared engine of both article analytics.
 *
 * Two processors (summary and takeaways) use the same split → process → merge
 * loop. At window level 1 there is no merge: one final call reads the whole
 * body. When the context overflows, the run climbs the window-divisor ladder
 * (`1 → 2 → 4 → 8 → 16`) and the level it *actually* executed is reported
 * back, so the caller can store it instead of deducing it.
 */
import { splitByLevels, splitByMarkdownHeaders } from '@/lib/utils/splitText';
import { isContextSizeError } from '@/runners/shared/contextSizeError';
import type { ArticleWindow, WindowPayload } from '@/types/articleAnalysis.types';
import type {
	TakeawaysChunkData,
	TakeawaysProcessor,
	WindowSummaryChunkData
} from '@/runners/shared/processors';

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

/** Options of a single analysis run, whichever processor runs it. */
export interface AnalysisRunOptions {
	/**
	 * Window divisor to start with. `null` splits by markdown headings
	 * instead (the web behaviour): no knob, no clamp. `1` reads the whole body
	 * in one final call, without an intermediate window pass.
	 */
	divisor: number | null;
	/** Splits by markdown headings instead of by level. */
	splitByHeaders?: boolean;
	/** Model used for the inference calls. */
	model?: string;
	/** Aborts the whole run, including the streamed final block. */
	signal?: AbortSignal;
	/** Called once per attempt, before its first window. */
	onAttempt?: (total: number) => void;
	/** Called after every window is processed, to stream progress. */
	onWindow?: (window: ArticleWindow, index: number, total: number) => void;
	/** Called when the final block (merge or direct call) starts. */
	onFinalStart?: () => void;
	/** Streams the final block (the merge call, or the direct level-1 call). */
	onFinalToken?: (token: string) => void;
}

export type AnalyzeWindowsOptions = AnalysisRunOptions;

/** Result of an analysis run. `summary` holds the final block of either analytic. */
export interface AnalysisRunResult {
	windows: ArticleWindow[];
	summary: string;
	/** The divisor that was actually executed; `null` in heading mode. */
	divisor: number | null;
}

export type AnalyzeWindowsResult = AnalysisRunResult;

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

/** Options of the shared split → process → merge loop. */
interface WindowPipelineOptions<TChunk, TResult> {
	divisor: number | null;
	splitByHeaders?: boolean;
	signal?: AbortSignal;
	/** Called once per attempt, before its first window. */
	onAttempt?: (total: number) => void;
	/** Called after each window is processed, before the merge. */
	onChunk?: (chunk: TChunk, slice: WindowSlice, index: number, total: number) => void;
	processChunk: (text: string, index: number, signal?: AbortSignal) => Promise<TChunk>;
	combineChunks: (
		chunks: TChunk[],
		options: { signal?: AbortSignal; onToken?: (token: string) => void }
	) => Promise<TResult>;
	/** Streams the final (merge) call. */
	onToken?: (token: string) => void;
}

/**
 * Runs one window pipeline, climbing the divisor ladder on a context overflow.
 *
 * `onAttempt` marks the start of each attempt, so a caller that accumulates
 * per-window data can drop the previous generation instead of mixing two
 * attempts. Heading mode has no ladder (the divisor is unknown there), so a
 * context error propagates.
 */
async function runWindowPipeline<TChunk, TResult>(
	content: string,
	options: WindowPipelineOptions<TChunk, TResult>
): Promise<{ result: TResult; divisor: number | null }> {
	let divisor = options.divisor;

	while (true) {
		try {
			const slices = splitArticleIntoWindows(content, {
				divisor,
				splitByHeaders: options.splitByHeaders
			});

			const chunks: TChunk[] = [];
			options.onAttempt?.(slices.length);
			for (const [index, slice] of slices.entries()) {
				const chunk = await options.processChunk(slice.text, index, options.signal);
				chunks.push(chunk);
				options.onChunk?.(chunk, slice, index, slices.length);
			}

			const result = await options.combineChunks(chunks, {
				signal: options.signal,
				onToken: options.onToken
			});

			return { result, divisor };
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

/** Options of one final-block call (merge or direct). */
interface FinalCallOptions {
	signal?: AbortSignal;
	onToken?: (token: string) => void;
}

/**
 * The part of a processor the shared engine needs: how to process one window,
 * how to build its stored payload, and how to produce the final block either
 * from stitched windows or straight from the raw body.
 */
interface AnalysisAdapter<TChunk> {
	processChunk: (text: string, index: number, signal?: AbortSignal) => Promise<TChunk>;
	toWindowData: (chunk: TChunk) => WindowPayload;
	finalWindowData: (final: string) => WindowPayload;
	combine: (chunks: TChunk[], options: FinalCallOptions) => Promise<string>;
	finalDirect: (text: string, options: FinalCallOptions) => Promise<string>;
}

/**
 * Runs one analytic through the shared window engine.
 *
 * At level 1 the whole body goes straight to the final prompt and is stored
 * as one synthetic window (`direct: true`) so persistence, embeddings and the
 * cached-analysis checks keep working. A context overflow there climbs to the
 * next rung and falls through to the normal window + merge path.
 */
async function runAnalysis<TChunk>(
	content: string,
	options: AnalysisRunOptions,
	adapter: AnalysisAdapter<TChunk>
): Promise<AnalysisRunResult> {
	const windows: ArticleWindow[] = [];
	let divisor = options.divisor;

	if (divisor === 1 && !options.splitByHeaders) {
		options.onAttempt?.(1);
		try {
			options.onFinalStart?.();
			const final = await adapter.finalDirect(content, {
				signal: options.signal,
				onToken: options.onFinalToken
			});
			const window: ArticleWindow = {
				index: 0,
				start: 0,
				end: content.length,
				data: { ...adapter.finalWindowData(final), direct: true }
			};
			windows.push(window);
			options.onWindow?.(window, 0, 1);
			return { windows, summary: final, divisor: 1 };
		} catch (error) {
			if (!isContextSizeError(error)) throw error;
			const next = nextWindowDivisor(1);
			if (next === undefined) throw error;
			divisor = next;
		}
	}

	const { result, divisor: executed } = await runWindowPipeline<TChunk, string>(content, {
		divisor,
		splitByHeaders: options.splitByHeaders,
		signal: options.signal,
		onAttempt: (total) => {
			// A ladder climb restarts with a fresh set of windows.
			windows.length = 0;
			options.onAttempt?.(total);
		},
		onChunk: (chunk, slice, index, total) => {
			const window: ArticleWindow = {
				index,
				start: slice.startOffset,
				end: slice.endOffset,
				data: adapter.toWindowData(chunk)
			};
			windows.push(window);
			options.onWindow?.(window, index, total);
		},
		processChunk: (text, index, signal) => adapter.processChunk(text, index, signal),
		combineChunks: (chunks, streamOptions) => {
			options.onFinalStart?.();
			return adapter.combine(chunks, streamOptions);
		},
		onToken: options.onFinalToken
	});

	return { windows, summary: result, divisor: executed };
}

/**
 * Runs the summary processor. Its final block is the merged summary (or the
 * direct one at level 1); every window also carries a title.
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

	return runAnalysis<WindowSummaryChunkData>(content, options, {
		processChunk: (text, index) => processor.processChunk(text, index),
		toWindowData: (data) => ({
			summary: data.summary,
			...(data.title ? { title: data.title } : {}),
			analysisType: 'summary'
		}),
		finalWindowData: (final) => ({ summary: final, analysisType: 'summary' }),
		combine: async (chunks) => (await processor.combineChunks(chunks)).summary,
		finalDirect: async (text, finalOptions) =>
			(await processor.finalDirect(text, finalOptions)).summary
	});
}

export interface AnalyzeTakeawaysOptions extends AnalysisRunOptions {
	/** Processor override for tests; defaults to the app processor. */
	processor?: TakeawaysProcessor;
}

export type AnalyzeTakeawaysResult = AnalysisRunResult;

/** Runs the takeaways processor through the very same window engine. */
export async function analyzeTakeaways(
	content: string,
	options: AnalyzeTakeawaysOptions
): Promise<AnalyzeTakeawaysResult> {
	const processor =
		options.processor ??
		(await import('@/runners/shared/processors')).windowTakeawaysProcessor.build({
			model: options.model
		});

	return runAnalysis<TakeawaysChunkData>(content, options, {
		processChunk: (text, index, signal) => processor.processChunk(text, index, { signal }),
		toWindowData: (data) => ({ summary: data.takeaways, analysisType: 'takeaways' }),
		finalWindowData: (final) => ({ summary: final, analysisType: 'takeaways' }),
		combine: async (chunks, finalOptions) =>
			(await processor.combineChunks(chunks, finalOptions)).takeaways,
		finalDirect: async (text, finalOptions) =>
			(await processor.finalDirect(text, finalOptions)).takeaways
	});
}
