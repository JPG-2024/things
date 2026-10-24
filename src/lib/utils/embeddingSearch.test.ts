import { describe, expect, test } from 'bun:test';
import { mergeSearchResults } from './embeddingSearch';
import type { SearchChunkResult } from './embeddingStore';

function chunk(overrides: Partial<SearchChunkResult> & { id: string }): SearchChunkResult {
	return {
		articleUrl: 'https://example.com/a',
		chunkText: 'chunk text',
		distance: 0.3,
		...overrides
	};
}

describe('mergeSearchResults', () => {
	test('merges groups and sorts by distance ascending', () => {
		const merged = mergeSearchResults([
			[chunk({ id: 'b', distance: 0.5 })],
			[chunk({ id: 'a', distance: 0.1 })]
		]);

		expect(merged.map((r) => r.id)).toEqual(['a', 'b']);
	});

	test('dedupes by id across tables keeping the first occurrence', () => {
		const merged = mergeSearchResults([
			[chunk({ id: 'a', articleUrl: 'https://example.com/first' })],
			[chunk({ id: 'a', articleUrl: 'https://example.com/second' })]
		]);

		expect(merged).toHaveLength(1);
		expect(merged[0].articleUrl).toBe('https://example.com/first');
	});

	test('drops chunks from the excluded article url', () => {
		const merged = mergeSearchResults(
			[
				[chunk({ id: 'self', articleUrl: 'https://example.com/self' })],
				[chunk({ id: 'other', articleUrl: 'https://example.com/other' })]
			],
			{ excludeArticleUrl: 'https://example.com/self' }
		);

		expect(merged.map((r) => r.id)).toEqual(['other']);
	});

	test('filters by maxDistance', () => {
		const merged = mergeSearchResults(
			[[chunk({ id: 'close', distance: 0.2 }), chunk({ id: 'far', distance: 0.9 })]],
			{ maxDistance: 0.5 }
		);

		expect(merged.map((r) => r.id)).toEqual(['close']);
	});

	test('caps results at maxResults', () => {
		const merged = mergeSearchResults(
			[
				[chunk({ id: 'a', distance: 0.1 }), chunk({ id: 'b', distance: 0.2 })],
				[chunk({ id: 'c', distance: 0.3 })]
			],
			{ maxResults: 2 }
		);

		expect(merged.map((r) => r.id)).toEqual(['a', 'b']);
	});

	test('returns empty for empty input', () => {
		expect(mergeSearchResults([])).toEqual([]);
	});
});
