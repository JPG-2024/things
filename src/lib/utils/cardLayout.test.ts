import { describe, expect, test } from 'bun:test';
import { CARD_LAYOUT_DEFAULTS } from '@/constants';
import { articleCapacity, clampCardLayout } from './cardLayout';

describe('clampCardLayout', () => {
	test('keeps values inside their bounds', () => {
		const clamped = clampCardLayout({ columns: 99, rows: 0 });

		expect(clamped).toEqual({ columns: 8, rows: 1 });
	});

	test('clamps both fields and keeps valid values', () => {
		expect(clampCardLayout({ ...CARD_LAYOUT_DEFAULTS.profiles, columns: 0 }).columns).toBe(1);
		expect(clampCardLayout(CARD_LAYOUT_DEFAULTS.categories)).toEqual(
			CARD_LAYOUT_DEFAULTS.categories
		);
	});
});

describe('articleCapacity', () => {
	test('is columns times rows, clamped first', () => {
		expect(articleCapacity(2, 3)).toBe(6);
		expect(articleCapacity(3, 2)).toBe(6);
		expect(articleCapacity(99, 1)).toBe(8);
		expect(articleCapacity(1, 7)).toBe(6);
	});
});
