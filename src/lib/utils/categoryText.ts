/**
 * Minimal shape needed to rank exemplar matches. Structurally compatible with
 * `CategoryExemplarSearchResult`, kept local so this module stays free of any
 * runtime dependency and can be unit tested in isolation.
 */
export type RankableExemplarMatch = {
	categoryId: string;
	distance: number;
};

const QUERY_KEYWORD_LIMIT = 15;
const QUERY_TOPIC_LIMIT = 30;
// The summary is the primary signal now, but `analysisTopic` produces one block
// per window (an entire merged document); cap it so the embeddings context
// cannot overflow.
const CATEGORY_SUMMARY_LIMIT = 4000;
// Upper bound on the per-window exemplars fed for one article. Long documents
// can produce many windows; the index only needs a representative sample.
const CATEGORY_WINDOW_LIMIT = 24;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function uniqueStrings(values: unknown, limit?: number): string[] {
	if (!Array.isArray(values)) return [];
	const deduped = [
		...new Set(values.filter((v): v is string => typeof v === 'string').map((v) => v.trim()))
	].filter(Boolean);
	return limit != null ? deduped.slice(0, limit) : deduped;
}

/**
 * Derive the text used to compare an article against a category's exemplars.
 *
 * The representation is `title + summary`: the article title is a stable,
 * discriminative signal, and the analysis summary is natural language (the
 * embeddings do better on it than on a comma-separated keyword soup). It is the
 * single source of truth for both sides of the comparison — the query built
 * from the current article and the exemplar stored when the user feeds a
 * category.
 *
 * `summary` comes from the recursive `{ chunks, finalResponse }` shape, a bare
 * string, or a flat string array. When there is no summary, it falls back to
 * `topics + keywords`. The `title` argument (the `title` task's data) wins over
 * a `finalResponse.title` when present. Returns an empty string when there is
 * nothing usable to compare.
 */
export function buildCategoryText(taskData: unknown, title?: string | null): string {
	const providedTitle = typeof title === 'string' ? title.trim() : '';

	const record = isRecord(taskData) ? taskData : null;
	const source = record && 'finalResponse' in record ? record.finalResponse : taskData;

	let summary = '';
	let analysisTitle = '';
	if (typeof source === 'string') {
		summary = source.trim();
	} else if (Array.isArray(source)) {
		summary = uniqueStrings(source).join(', ');
	} else if (isRecord(source)) {
		if (typeof source.title === 'string') analysisTitle = source.title.trim();
		if (typeof source.summary === 'string') summary = source.summary.trim();
		if (!summary) {
			const topics = uniqueStrings(source.topics, QUERY_TOPIC_LIMIT);
			const keywords = uniqueStrings(source.keywords, QUERY_KEYWORD_LIMIT);
			summary = [topics.join(', '), keywords.join(', ')].filter(Boolean).join('\n');
		}
	}

	summary = summary.slice(0, CATEGORY_SUMMARY_LIMIT).trim();
	const resolvedTitle = providedTitle || analysisTitle;

	return [resolvedTitle, summary].filter(Boolean).join('\n\n').trim();
}

/**
 * Per-window summaries from a `windowSummary` analysis result.
 *
 * The recursive `{ chunks, finalResponse }` shape stores one `{ summary }` per
 * window; empty and duplicate summaries are dropped so they never become
 * duplicate exemplars. Returns `[]` for any other result shape.
 */
export function extractWindowSummaries(taskData: unknown): string[] {
	if (!isRecord(taskData)) return [];
	const chunks = taskData.chunks;
	if (!Array.isArray(chunks)) return [];

	const summaries: string[] = [];
	for (const entry of chunks) {
		if (!isRecord(entry)) continue;
		const chunkData = entry.data;
		if (!isRecord(chunkData)) continue;
		const summary = typeof chunkData.summary === 'string' ? chunkData.summary.trim() : '';
		if (summary) summaries.push(summary);
	}

	return [...new Set(summaries)];
}

/**
 * Build one exemplar text per window summary, each as `title + window summary`.
 *
 * `windowSummary` keeps every window small enough for the embedding window, so
 * (unlike `buildCategoryText`'s 4000-char cap on the combined final summary)
 * nothing is truncated. Capped at `CATEGORY_WINDOW_LIMIT` windows; returns `[]`
 * when the task data holds no window summaries.
 */
export function buildCategoryWindowTexts(taskData: unknown, title?: string | null): string[] {
	const providedTitle = typeof title === 'string' ? title.trim() : '';
	const summaries = extractWindowSummaries(taskData).slice(0, CATEGORY_WINDOW_LIMIT);

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
