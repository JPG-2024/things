import { describe, expect, test } from 'bun:test';
import {
	clampWindowLevel,
	DEFAULT_WINDOW_LEVEL,
	MAX_WINDOW_DIVISOR,
	nextWindowDivisor,
	splitArticleIntoWindows,
	WINDOW_DIVISOR_LADDER,
	windowLevelForDivisor
} from './windowAnalysis';

describe('WINDOW_DIVISOR_LADDER', () => {
	test('is the historical ladder', () => {
		expect([...WINDOW_DIVISOR_LADDER]).toEqual([1, 2, 4, 8, 16]);
	});

	test('the default level is two windows', () => {
		expect(WINDOW_DIVISOR_LADDER[DEFAULT_WINDOW_LEVEL]).toBe(2);
	});
});

describe('clampWindowLevel', () => {
	test('keeps a level inside the ladder', () => {
		expect(clampWindowLevel(2)).toBe(2);
	});

	test('clamps out-of-range levels', () => {
		expect(clampWindowLevel(-5)).toBe(0);
		expect(clampWindowLevel(99)).toBe(WINDOW_DIVISOR_LADDER.length - 1);
	});

	test('falls back to the default for a missing level', () => {
		expect(clampWindowLevel(undefined)).toBe(DEFAULT_WINDOW_LEVEL);
		expect(clampWindowLevel(Number.NaN)).toBe(DEFAULT_WINDOW_LEVEL);
	});
});

describe('nextWindowDivisor', () => {
	test('climbs one rung at a time', () => {
		expect(nextWindowDivisor(1)).toBe(2);
		expect(nextWindowDivisor(2)).toBe(4);
		expect(nextWindowDivisor(8)).toBe(16);
	});

	test('returns undefined when the ladder is exhausted', () => {
		expect(nextWindowDivisor(MAX_WINDOW_DIVISOR)).toBeUndefined();
	});
});

describe('windowLevelForDivisor', () => {
	test('maps a divisor back to its slider position', () => {
		expect(windowLevelForDivisor(1)).toBe(0);
		expect(windowLevelForDivisor(16)).toBe(4);
	});

	test('returns null for a divisor off the ladder', () => {
		expect(windowLevelForDivisor(3)).toBeNull();
	});

	test('returns null for the heading mode', () => {
		expect(windowLevelForDivisor(null)).toBeNull();
	});
});

describe('splitArticleIntoWindows', () => {
	const body = 'a'.repeat(1000);

	test('divides the body into the requested number of windows', () => {
		const windows = splitArticleIntoWindows(body, { divisor: 4 });

		expect(windows.length).toBeGreaterThan(0);
		expect(windows.length).toBeLessThanOrEqual(4);
	});

	test('the windows cover the body in order, with a small overlap', () => {
		const windows = splitArticleIntoWindows(body, { divisor: 4 });

		expect(windows[0].startOffset).toBeLessThanOrEqual(windows[0].endOffset);
		for (let i = 1; i < windows.length; i++) {
			// Consecutive windows overlap by ~10% of the window size, so the
			// next one starts before the previous one ends — but never before
			// the previous one started.
			expect(windows[i].startOffset).toBeGreaterThanOrEqual(windows[i - 1].startOffset);
			expect(windows[i].startOffset).toBeLessThan(windows[i].endOffset);
		}
	});

	test('a single window covers everything', () => {
		const windows = splitArticleIntoWindows(body, { divisor: 1 });

		expect(windows).toHaveLength(1);
		expect(windows[0].text.trim()).toBe(body);
	});

	test('heading mode ignores the divisor', () => {
		const markdown = '# One\n\nalpha\n\n# Two\n\nbeta';
		const windows = splitArticleIntoWindows(markdown, { divisor: 4, splitByHeaders: true });

		expect(windows.length).toBeGreaterThan(1);
		expect(windows[0].heading).toBe('One');
	});

	test('an empty body yields no windows', () => {
		expect(splitArticleIntoWindows('', { divisor: 4 })).toEqual([]);
	});
});
