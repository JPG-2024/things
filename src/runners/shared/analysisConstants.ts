export type AnalysisDepthLevel = {
	/** 1-based slider position. */
	depth: number;
	/** Window divisor the run starts at for this depth. */
	divisor: number;
	/** Topics requested per window for this depth. */
	topicCount: number;
	/**
	 * Keywords requested per window for this depth. Omitted rows fall back to
	 * the processor default (`DEFAULT_KEYWORD_COUNT`).
	 */
	keywordCount?: number;
};

/**
 * Single source of truth for the "analysis depth" slider. Each rung divides
 * the content into `divisor` windows (each window is one summary block, i.e.
 * one LLM call) and asks every window for `topicCount` topics. The per-rung
 * totals are the product `divisor * topicCount` (4, 8, 16, 64, 160) and are
 * aspirational: the final merge dedupes similar topics, so fewer may survive.
 */
export const ANALYSIS_DEPTH_LEVELS: readonly AnalysisDepthLevel[] = [
	// Rung 1 is the basic overview: one window over the whole content with
	// four topics. From there each rung doubles the windows; the deep rungs
	// also ask the smaller windows for richer topic lists.
	{ depth: 1, divisor: 1, topicCount: 8 },
	{ depth: 2, divisor: 2, topicCount: 4 },
	{ depth: 3, divisor: 4, topicCount: 4 },
	{ depth: 4, divisor: 8, topicCount: 8 },
	{ depth: 5, divisor: 16, topicCount: 10 }
];

export const MIN_ANALYSIS_DEPTH = ANALYSIS_DEPTH_LEVELS[0].depth;
export const MAX_ANALYSIS_DEPTH = ANALYSIS_DEPTH_LEVELS[ANALYSIS_DEPTH_LEVELS.length - 1].depth;
// Born at depth 2: two windows instead of the single-window overview pass.
// The user-facing default lives in `viewState.analysisDepth` (persisted in the
// settings store); this constant is only the initial value for it.
export const DEFAULT_ANALYSIS_DEPTH = 2;

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

/**
 * Slider position an analysis task should display given the depth pinned in
 * its config and the divisor its last run actually used. The context-overflow
 * ladder can clamp the run deeper than the pinned divisor; when that happened
 * (runtime strictly deeper), show the row the run landed on so the selector
 * matches reality. The strict comparison matters: `task.data.windowDivisor`
 * is only written on run completion, so a runtime value shallower than the
 * pinned divisor is stale data from an older config and must not move the
 * thumb. The clamp branch matches by divisor alone: a clamped run keeps the
 * pinned per-window topic count, so the landed divisor is the only honest
 * signal. Legacy tasks (no `analysisDepth`) snap to the closest row from
 * their divisor and topic count, as before.
 */
export function effectiveAnalysisDepth(
	configDepth: number | undefined,
	runtimeDivisor: number | undefined,
	topicCount: number | undefined
): number {
	const pinned = analysisDepthLevel(configDepth);
	if (pinned && runtimeDivisor !== undefined && runtimeDivisor > pinned.divisor) {
		return nearestAnalysisDepth(runtimeDivisor, undefined);
	}
	return configDepth ?? nearestAnalysisDepth(runtimeDivisor, topicCount);
}
