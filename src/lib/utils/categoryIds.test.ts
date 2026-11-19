import { describe, expect, test } from 'bun:test';
import { hasExcludedCategory, normalizeCategoryIds, parseCategoryIds } from './categoryIds';

describe('parseCategoryIds', () => {
	test('splits comma-separated ids and trims them', () => {
		expect(parseCategoryIds('2,34')).toEqual(['2', '34']);
		expect(parseCategoryIds('2, 34 , 5')).toEqual(['2', '34', '5']);
	});

	test('accepts the bracketed list form', () => {
		expect(parseCategoryIds('[2, 34]')).toEqual(['2', '34']);
	});

	test('drops empty entries and duplicates', () => {
		expect(parseCategoryIds('2,,34, 2,')).toEqual(['2', '34']);
	});

	test('an empty field yields no ids', () => {
		expect(parseCategoryIds('')).toEqual([]);
		expect(parseCategoryIds('[]')).toEqual([]);
	});
});

describe('normalizeCategoryIds', () => {
	test('normalizes ids read from settings, ignoring non-trimmed noise', () => {
		expect(normalizeCategoryIds([' 1 ', '', '1', '34'])).toEqual(['1', '34']);
	});
});

describe('hasExcludedCategory', () => {
	test('matches when the profile carries one of the excluded ids', () => {
		expect(hasExcludedCategory(['rock', 'music'], ['music'])).toBe(true);
		expect(hasExcludedCategory(['1', '2'], ['2', '34'])).toBe(true);
	});

	test('stays false with no match or an empty exclusion list', () => {
		expect(hasExcludedCategory(['rock'], ['music'])).toBe(false);
		expect(hasExcludedCategory(['music'], [])).toBe(false);
		expect(hasExcludedCategory([], ['music'])).toBe(false);
	});
});
