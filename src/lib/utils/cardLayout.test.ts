import { describe, expect, test } from 'bun:test';
import { CARD_LAYOUT_DEFAULTS } from '@/constants';
import {
	articleCapacity,
	clampCardLayout,
	entityCardWidth,
	entityColumnWidth,
	entityGridWidth
} from './cardLayout';

describe('clampCardLayout', () => {
	test('keeps values inside their bounds', () => {
		const clamped = clampCardLayout({
			columns: 99,
			rows: 0,
			cardsPerColumn: -3,
			cellWidth: 1000
		});

		expect(clamped).toEqual({ columns: 8, rows: 1, cardsPerColumn: 1, cellWidth: 320 });
	});

	test('clamps cellWidth to the lower bound and keeps valid values', () => {
		expect(clampCardLayout({ ...CARD_LAYOUT_DEFAULTS.profiles, cellWidth: 10 }).cellWidth).toBe(60);
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

describe('width helpers', () => {
	test('grid width is cells plus inner gaps', () => {
		expect(entityGridWidth({ columns: 3, rows: 2, cardsPerColumn: 1, cellWidth: 130 })).toBe(
			3 * 130 + 2 * 12
		);
	});

	test('card width adds the Card horizontal padding', () => {
		const layout = { columns: 2, rows: 3, cardsPerColumn: 2, cellWidth: 110 };
		expect(entityCardWidth(layout)).toBe(entityGridWidth(layout) + 32);
	});

	test('entityColumnWidth is a CSS length string', () => {
		expect(entityColumnWidth(CARD_LAYOUT_DEFAULTS.categories)).toBe('446px');
	});
});
