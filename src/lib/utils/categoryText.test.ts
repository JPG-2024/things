import { describe, expect, test } from 'bun:test';
import { buildCategoryText, rankExemplarMatches } from './categoryText';

describe('buildCategoryText', () => {
	test('composes title + summary', () => {
		const text = buildCategoryText(
			'A paragraph about markets and inflation.',
			'The economy in 2026'
		);

		expect(text).toBe('The economy in 2026\n\nA paragraph about markets and inflation.');
	});

	test('works without a title', () => {
		expect(buildCategoryText('One paragraph.')).toBe('One paragraph.');
	});

	test('uses the title alone when there is no summary', () => {
		expect(buildCategoryText(null, 'My article')).toBe('My article');
	});

	test('caps the summary at 4000 chars', () => {
		const summary = 'x'.repeat(5000);

		const text = buildCategoryText(summary);

		expect(text).toHaveLength(4000);
	});

	test('trims the summary', () => {
		expect(buildCategoryText('  hello  ', 'Title')).toBe('Title\n\nhello');
	});

	test('returns empty for unusable input', () => {
		expect(buildCategoryText(null)).toBe('');
		expect(buildCategoryText(undefined)).toBe('');
		expect(buildCategoryText('')).toBe('');
	});
});

describe('rankExemplarMatches', () => {
	test('keeps the best match per category', () => {
		const ranked = rankExemplarMatches(
			[
				{ categoryId: 'cat-a', distance: 0.2 },
				{ categoryId: 'cat-a', distance: 0.5 },
				{ categoryId: 'cat-b', distance: 0.3 }
			],
			{ topN: 2, minSimilarity: 0.5 }
		);

		expect(ranked).toEqual(['cat-a', 'cat-b']);
	});

	test('filters out categories below the similarity threshold', () => {
		const ranked = rankExemplarMatches(
			[
				{ categoryId: 'cat-a', distance: 0.4 },
				{ categoryId: 'cat-c', distance: 0.9 }
			],
			{ topN: 5, minSimilarity: 0.5 }
		);

		expect(ranked).toEqual(['cat-a']);
	});

	test('sorts by descending similarity and slices to topN', () => {
		const ranked = rankExemplarMatches(
			[
				{ categoryId: 'cat-a', distance: 0.5 },
				{ categoryId: 'cat-b', distance: 0.1 },
				{ categoryId: 'cat-c', distance: 0.3 }
			],
			{ topN: 2, minSimilarity: 0 }
		);

		expect(ranked).toEqual(['cat-b', 'cat-c']);
	});

	test('returns empty when the top two are within the margin', () => {
		const ranked = rankExemplarMatches(
			[
				{ categoryId: 'cat-a', distance: 0.3 }, // sim 0.70
				{ categoryId: 'cat-b', distance: 0.33 } // sim 0.67
			],
			{ topN: 1, minSimilarity: 0.5, margin: 0.05 }
		);

		expect(ranked).toEqual([]);
	});

	test('assigns the winner when it beats the runner-up by the margin', () => {
		const ranked = rankExemplarMatches(
			[
				{ categoryId: 'cat-a', distance: 0.2 }, // sim 0.80
				{ categoryId: 'cat-b', distance: 0.4 } // sim 0.60
			],
			{ topN: 1, minSimilarity: 0.5, margin: 0.05 }
		);

		expect(ranked).toEqual(['cat-a']);
	});

	test('a single surviving category is never treated as ambiguous', () => {
		const ranked = rankExemplarMatches([{ categoryId: 'cat-a', distance: 0.2 }], {
			topN: 1,
			minSimilarity: 0.5,
			margin: 0.05
		});

		expect(ranked).toEqual(['cat-a']);
	});

	test('returns empty for no matches', () => {
		expect(rankExemplarMatches([], { topN: 3, minSimilarity: 0.5 })).toEqual([]);
	});
});
