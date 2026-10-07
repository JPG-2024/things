export const WINDOW_DIVISOR_LADDER = [1, 2, 4, 8, 16] as const;
export const WINDOW_LEVEL_LABELS = WINDOW_DIVISOR_LADDER.map(String);
export const MAX_WINDOW_DIVISOR = WINDOW_DIVISOR_LADDER[WINDOW_DIVISOR_LADDER.length - 1];
export const TARGET_CHUNK_SIZE = 15000;
export const WINDOW_OVERLAP_RATIO = 0.1;

export type AnalysisDepthLevel = {
	/** 1-based slider position. */
	depth: number;
	/** Window divisor the run starts at for this depth. */
	divisor: number;
	/** Topics requested per window for this depth. */
	topicCount: number;
};

/**
 * Single source of truth for the "analysis depth" slider. Depth 1 is the most
 * basic pass: one window asking for one topic. Each step splits the content
 * into more windows and asks each window for more topics.
 */
export const ANALYSIS_DEPTH_LEVELS: readonly AnalysisDepthLevel[] = [
	{ depth: 1, divisor: 1, topicCount: 1 },
	{ depth: 2, divisor: 1, topicCount: 4 },
	{ depth: 3, divisor: 2, topicCount: 4 },
	{ depth: 4, divisor: 8, topicCount: 8 },
	// Capped by the processor's MAX_TOPIC_COUNT (10).
	{ depth: 5, divisor: 16, topicCount: 10 }
];

export const MIN_ANALYSIS_DEPTH = ANALYSIS_DEPTH_LEVELS[0].depth;
export const MAX_ANALYSIS_DEPTH = ANALYSIS_DEPTH_LEVELS[ANALYSIS_DEPTH_LEVELS.length - 1].depth;
export const DEFAULT_ANALYSIS_DEPTH = MIN_ANALYSIS_DEPTH;

export function analysisDepthLevel(depth: number | undefined): AnalysisDepthLevel | undefined {
	if (depth === undefined) return undefined;
	return ANALYSIS_DEPTH_LEVELS.find((level) => level.depth === depth);
}

/**
 * Recovers a slider position for tasks persisted before the depth field
 * existed: prefer an exact divisor match, then an exact topic-count match,
 * then the closest row by combined distance.
 */
export function nearestAnalysisDepth(
	divisor: number | undefined,
	topicCount: number | undefined
): number {
	if (divisor === undefined && topicCount === undefined) return DEFAULT_ANALYSIS_DEPTH;

	if (divisor !== undefined) {
		const byDivisor = ANALYSIS_DEPTH_LEVELS.find((level) => level.divisor === divisor);
		if (byDivisor) return byDivisor.depth;
	}
	if (topicCount !== undefined) {
		const byTopics = ANALYSIS_DEPTH_LEVELS.find((level) => level.topicCount === topicCount);
		if (byTopics) return byTopics.depth;
	}

	let best = ANALYSIS_DEPTH_LEVELS[0];
	let bestDistance = Number.POSITIVE_INFINITY;
	for (const level of ANALYSIS_DEPTH_LEVELS) {
		const distance =
			(divisor !== undefined ? Math.abs(level.divisor - divisor) : 0) +
			(topicCount !== undefined ? Math.abs(level.topicCount - topicCount) : 0);
		if (distance < bestDistance) {
			bestDistance = distance;
			best = level;
		}
	}
	return best.depth;
}
