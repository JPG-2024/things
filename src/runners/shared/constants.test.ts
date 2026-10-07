import { describe, expect, test } from 'bun:test';
import {
	ANALYSIS_DEPTH_LEVELS,
	analysisDepthLevel,
	DEFAULT_ANALYSIS_DEPTH,
	MAX_ANALYSIS_DEPTH,
	MIN_ANALYSIS_DEPTH,
	nearestAnalysisDepth
} from './constants';

describe('analysis depth levels', () => {
	test('depth 1 is the basic single-window pass', () => {
		expect(analysisDepthLevel(1)).toEqual({ depth: 1, divisor: 1, topicCount: 1 });
	});

	test('every rung has a unique depth and non-decreasing effort', () => {
		const depths = ANALYSIS_DEPTH_LEVELS.map((level) => level.depth);
		expect(new Set(depths).size).toBe(depths.length);
		for (let i = 0; i < ANALYSIS_DEPTH_LEVELS.length; i++) {
			const level = ANALYSIS_DEPTH_LEVELS[i];
			expect(level.divisor).toBeGreaterThanOrEqual(1);
			expect(level.topicCount).toBeGreaterThanOrEqual(1);
			if (i > 0) {
				expect(level.divisor).toBeGreaterThanOrEqual(ANALYSIS_DEPTH_LEVELS[i - 1].divisor);
				expect(level.topicCount).toBeGreaterThanOrEqual(ANALYSIS_DEPTH_LEVELS[i - 1].topicCount);
			}
		}
	});

	test('bounds match the array ends', () => {
		expect(MIN_ANALYSIS_DEPTH).toBe(1);
		expect(MAX_ANALYSIS_DEPTH).toBe(5);
		expect(DEFAULT_ANALYSIS_DEPTH).toBe(MIN_ANALYSIS_DEPTH);
	});

	test('unknown depth resolves to undefined', () => {
		expect(analysisDepthLevel(0)).toBeUndefined();
		expect(analysisDepthLevel(6)).toBeUndefined();
		expect(analysisDepthLevel(undefined)).toBeUndefined();
	});
});

describe('nearestAnalysisDepth', () => {
	test('defaults to depth 1 when nothing is stored', () => {
		expect(nearestAnalysisDepth(undefined, undefined)).toBe(1);
	});

	test('prefers an exact divisor match', () => {
		expect(nearestAnalysisDepth(8, 3)).toBe(4);
	});

	test('falls back to an exact topic-count match', () => {
		expect(nearestAnalysisDepth(3, 10)).toBe(5);
	});

	test('snaps by combined distance when nothing matches', () => {
		expect(nearestAnalysisDepth(3, 3)).toBe(3);
	});
});
