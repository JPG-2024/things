import { describe, expect, test } from 'bun:test';
import { resolveWheelDelta } from './wheelDelta';

describe('resolveWheelDelta', () => {
	test('wheel down is positive, up is negative', () => {
		expect(resolveWheelDelta(0, 120, 0)).toBe(120);
		expect(resolveWheelDelta(0, -120, 0)).toBe(-120);
	});

	test('falls back to deltaX when the platform translates shift+wheel horizontally', () => {
		expect(resolveWheelDelta(120, 0, 0)).toBe(120);
		expect(resolveWheelDelta(-120, 0, 0)).toBe(-120);
	});

	test('uses the dominant axis when both are present', () => {
		expect(resolveWheelDelta(10, 120, 0)).toBe(120);
		expect(resolveWheelDelta(120, 10, 0)).toBe(120);
	});

	test('normalizes line and page delta modes', () => {
		expect(resolveWheelDelta(0, 3, 1)).toBe(48);
		expect(resolveWheelDelta(0, 1, 2, 900)).toBe(900);
	});

	test('is zero when the event carries no delta', () => {
		expect(resolveWheelDelta(0, 0, 0)).toBe(0);
	});
});
