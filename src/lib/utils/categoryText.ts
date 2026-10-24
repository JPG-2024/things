/**
 * Minimal shape needed to rank exemplar matches. Structurally compatible with
 * `CategoryExemplarSearchResult`, kept local so this module stays free of any
 * runtime dependency and can be unit tested in isolation.
 */
export type RankableExemplarMatch = {
	categoryId: string;
	distance: number;
};

// The summary is the primary signal, but it can be an entire merged document;
// cap it so the embeddings context cannot overflow.
const CATEGORY_SUMMARY_LIMIT = 4000;
// Upper bound on the per-window exemplars fed for one article. Long documents
// can produce many windows; the index only needs a representative sample.
const CATEGORY_WINDOW_LIMIT = 24;

/**
 * Derive the text used to compare an article against a category's exemplars.
 *
 * The representation is `title + summary`: the article title is a stable,
 * discriminative signal, and the analysis summary is natural language (the
 * embeddings do better on it than on a comma-separated keyword soup). It is the
 * single source of truth for both sides of the comparison — the query built
 * from the current article and the exemplar stored when the user feeds a
 * category.
 */
export function buildCategoryText(
	summary: string | null | undefined,
	title?: string | null
): string {
	const resolvedTitle = typeof title === 'string' ? title.trim() : '';
	const resolvedSummary =
		typeof summary === 'string' ? summary.slice(0, CATEGORY_SUMMARY_LIMIT).trim() : '';

	return [resolvedTitle, resolvedSummary].filter(Boolean).join('\n\n').trim();
}

/**
 * Per-window summaries of an analysis.
 *
 * Empty and duplicate summaries are dropped so they never become duplicate
 * exemplars.
 */
export function extractWindowSummaries(
	windows: Array<{ data?: { summary?: unknown } }> | null | undefined
): string[] {
	if (!Array.isArray(windows)) return [];

	const summaries: string[] = [];
	for (const window of windows) {
		const summary = typeof window?.data?.summary === 'string' ? window.data.summary.trim() : '';
		if (summary) summaries.push(summary);
	}

	return [...new Set(summaries)];
}

/**
 * Build one exemplar text per window summary, each as `title + window summary`.
 *
 * Capped at `CATEGORY_WINDOW_LIMIT` windows; returns `[]` when the analysis
 * holds no window summaries.
 */
export function buildCategoryWindowTexts(
	windows: Array<{ data?: { summary?: unknown } }> | null | undefined,
	title?: string | null
): string[] {
	const providedTitle = typeof title === 'string' ? title.trim() : '';
	const summaries = extractWindowSummaries(windows).slice(0, CATEGORY_WINDOW_LIMIT);

	return summaries.map((summary) =>
		[providedTitle, summary.slice(0, CATEGORY_SUMMARY_LIMIT).trim()].filter(Boolean).join('\n\n')
	);
}

/**
 * Collapse raw exemplar matches to the best similarity per category, then
 * filter by `minSimilarity` and keep the `topN` categories by descending
 * similarity.
 *
 * When `margin` is set, the winner must beat the runner-up by at least that
 * delta; otherwise the result is ambiguous and an empty list is returned (no
 * assignment) so a near tie does not flip a category around. Pure so this rule
 * can be tested without the embeddings backend.
 */
export function rankExemplarMatches(
	results: RankableExemplarMatch[],
	options: { topN: number; minSimilarity: number; margin?: number }
): string[] {
	const bestByCategory = new Map<string, number>();
	for (const result of results) {
		const similarity = 1 - result.distance;
		const current = bestByCategory.get(result.categoryId);
		if (current === undefined || similarity > current) {
			bestByCategory.set(result.categoryId, similarity);
		}
	}

	const ranked = [...bestByCategory.entries()]
		.filter(([, similarity]) => similarity >= options.minSimilarity)
		.sort((a, b) => b[1] - a[1]);

	if (ranked.length === 0) return [];

	const margin = options.margin ?? 0;
	if (margin > 0 && ranked.length > 1 && ranked[0][1] - ranked[1][1] < margin) {
		return [];
	}

	return ranked.slice(0, options.topN).map(([categoryId]) => categoryId);
}
