/**
 * Merging of nearest-neighbour results.
 *
 * This module is pure on purpose (no runtime imports) so the merge rules can
 * be unit tested without the embeddings backend. The queries themselves live
 * in `embeddingStore.ts`.
 */
import type { SearchChunkResult } from './embeddingStore';

export interface MergeSearchResultsOptions {
	excludeArticleUrl?: string;
	maxDistance?: number;
	maxResults?: number;
}

/**
 * Merge nearest-neighbour results from several embedding tables into one
 * ranked list.
 *
 * Dedupes by result id across tables (ids are per-table), drops chunks from
 * `excludeArticleUrl` (e.g. the article currently being read), sorts by
 * distance ascending, filters by `maxDistance` when given, and caps the list
 * at `maxResults`.
 *
 * Pure by design: this module stays free of store/runtime imports so it can be
 * unit tested directly.
 */
export function mergeSearchResults(
	groups: SearchChunkResult[][],
	options: MergeSearchResultsOptions = {}
): SearchChunkResult[] {
	const { excludeArticleUrl, maxDistance, maxResults } = options;

	const seen = new Set<string>();
	const merged: SearchChunkResult[] = [];
	for (const group of groups) {
		for (const result of group) {
			if (excludeArticleUrl && result.articleUrl === excludeArticleUrl) continue;
			if (result.id && seen.has(result.id)) continue;
			if (result.id) seen.add(result.id);
			merged.push(result);
		}
	}

	merged.sort((a, b) => a.distance - b.distance);
	const filtered = maxDistance != null ? merged.filter((r) => r.distance <= maxDistance) : merged;

	return maxResults != null ? filtered.slice(0, maxResults) : filtered;
}
