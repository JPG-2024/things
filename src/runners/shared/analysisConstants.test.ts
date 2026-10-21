import { describe, expect, test } from 'bun:test';
import {
	ANALYSIS_DEPTH_LEVELS,
	analysisDepthLevel,
	DEFAULT_ANALYSIS_DEPTH,
	effectiveAnalysisDepth,
	MAX_ANALYSIS_DEPTH,
	MIN_ANALYSIS_DEPTH,
	nearestAnalysisDepth
} from './analysisConstants';

describe('analysis depth levels', () => {
	test('depth 1 is the basic overview: one block, four topics', () => {
		expect(analysisDepthLevel(1)).toEqual({ depth: 1, divisor: 1, topicCount: 4 });
	});

	test('depth 2 splits the content into two blocks', () => {
		expect(analysisDepthLevel(2)).toEqual({ depth: 2, divisor: 2, topicCount: 4 });
	});

	test('every rung has a unique depth and non-decreasing effort', () => {
		const depths = ANALYSIS_DEPTH_LEVELS.map((level) => level.depth);
		expect(new Set(depths).size).toBe(depths.length);
		for (let i = 0; i < ANALYSIS_DEPTH_LEVELS.length; i++) {
			const level = ANALYSIS_DEPTH_LEVELS[i];
			expect(level.divisor).toBeGreaterThanOrEqual(1);
			expect(level.topicCount).toBeGreaterThanOrEqual(1);
			if (i > 0) {
				expect(level.divisor).toBeGreaterThan(ANALYSIS_DEPTH_LEVELS[i - 1].divisor);
				expect(level.topicCount).toBeGreaterThanOrEqual(ANALYSIS_DEPTH_LEVELS[i - 1].topicCount);
			}
		}
	});

	test('bounds match the array ends', () => {
		expect(MIN_ANALYSIS_DEPTH).toBe(1);
		expect(MAX_ANALYSIS_DEPTH).toBe(5);
		expect(DEFAULT_ANALYSIS_DEPTH).toBe(2);
	});

	test('unknown depth resolves to undefined', () => {
		expect(analysisDepthLevel(0)).toBeUndefined();
		expect(analysisDepthLevel(6)).toBeUndefined();
		expect(analysisDepthLevel(undefined)).toBeUndefined();
	});
});

describe('nearestAnalysisDepth', () => {
	test('defaults to the default depth when nothing is stored', () => {
		expect(nearestAnalysisDepth(undefined, undefined)).toBe(DEFAULT_ANALYSIS_DEPTH);
	});

	test('prefers an exact divisor match', () => {
		expect(nearestAnalysisDepth(8, 3)).toBe(4);
	});

	test('falls back to an exact topic-count match', () => {
		expect(nearestAnalysisDepth(3, 10)).toBe(5);
	});

	test('snaps by combined distance when nothing matches', () => {
		expect(nearestAnalysisDepth(3, 3)).toBe(2);
	});
});

describe('effectiveAnalysisDepth', () => {
	test('shows the row the run landed on after a context clamp', () => {
		// Pinned depth 3 (÷4) clamped by the ladder to ÷16: the selector
		// moves to depth 5 even though the stored config still says 3.
		expect(effectiveAnalysisDepth(3, 16, undefined)).toBe(5);
		expect(effectiveAnalysisDepth(2, 4, undefined)).toBe(3);
	});

	test('clamping matches by divisor alone, not the pinned topic count', () => {
		// A clamped run keeps the pinned per-window count, so the landed
		// divisor is the only honest signal.
		expect(effectiveAnalysisDepth(3, 16, 4)).toBe(5);
	});

	test('stays on the pinned depth when the run did not clamp', () => {
		expect(effectiveAnalysisDepth(3, 4, 4)).toBe(3);
		expect(effectiveAnalysisDepth(3, undefined, undefined)).toBe(3);
	});

	test('ignores a stale runtime divisor shallower than the pinned depth', () => {
		// Runtime data only lands on run completion; a shallower divisor is
		// left over from an older config (e.g. a failed re-run).
		expect(effectiveAnalysisDepth(4, 2, 8)).toBe(4);
	});

	test('legacy tasks without a pinned depth snap to divisor/topic count', () => {
		expect(effectiveAnalysisDepth(undefined, 8, undefined)).toBe(4);
		expect(effectiveAnalysisDepth(undefined, undefined, 10)).toBe(5);
		expect(effectiveAnalysisDepth(undefined, undefined, undefined)).toBe(DEFAULT_ANALYSIS_DEPTH);
	});
});
