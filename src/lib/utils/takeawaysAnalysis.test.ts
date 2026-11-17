import { describe, expect, test } from 'bun:test';
import { analyzeTakeaways, type AnalyzeTakeawaysOptions } from './windowAnalysis';
import type { TakeawaysProcessor } from '@/runners/shared/processors';

const BODY = 'a'.repeat(1000);

function contextError(): Error {
	return new Error('exceed_context_size_error: prompt exceeds the available context size');
}

interface StubStats {
	windowCalls: number;
	mergeCalls: number;
	directCalls: number;
}

/** Processor stub: every call returns a partial, the final block streams. */
function stubProcessor(
	stats: StubStats,
	options: { climbOnWholeBody?: boolean } = {}
): TakeawaysProcessor {
	return {
		processChunk: async (text) => {
			stats.windowCalls++;
			if (options.climbOnWholeBody && text.length > 900) throw contextError();
			return { takeaways: `window ${text.length}` };
		},
		combineChunks: async (results, stream) => {
			stats.mergeCalls++;
			stream?.onToken?.('- ');
			stream?.onToken?.('takeaway');
			return { takeaways: results.length ? '- takeaway' : '' };
		},
		finalDirect: async (_text, stream) => {
			stats.directCalls++;
			if (options.climbOnWholeBody) throw contextError();
			stream?.onToken?.('- ');
			stream?.onToken?.('direct');
			return { takeaways: '- direct' };
		}
	};
}

describe('analyzeTakeaways', () => {
	test('streams the final merge and reports window progress', async () => {
		const stats: StubStats = { windowCalls: 0, mergeCalls: 0, directCalls: 0 };
		const tokens: string[] = [];
		const attempts: number[] = [];
		const progress: Array<[number, number]> = [];
		const options: AnalyzeTakeawaysOptions = {
			divisor: 2,
			processor: stubProcessor(stats),
			onAttempt: (total) => attempts.push(total),
			onWindow: (_window, index, total) => progress.push([index, total]),
			onFinalToken: (token) => tokens.push(token)
		};

		const result = await analyzeTakeaways(BODY, options);

		expect(attempts).toEqual([2]);
		expect(progress.map(([index]) => index)).toEqual([0, 1]);
		expect(tokens).toEqual(['- ', 'takeaway']);
		expect(stats.mergeCalls).toBe(1);
		expect(stats.directCalls).toBe(0);
		expect(result.summary).toBe('- takeaway');
		expect(result.divisor).toBe(2);
		expect(result.windows[0].data).toMatchObject({ analysisType: 'takeaways' });
	});

	test('level 1 streams the final block with no window pass', async () => {
		const stats: StubStats = { windowCalls: 0, mergeCalls: 0, directCalls: 0 };
		const tokens: string[] = [];
		const result = await analyzeTakeaways(BODY, {
			divisor: 1,
			processor: stubProcessor(stats),
			onFinalToken: (token) => tokens.push(token)
		});

		expect(stats.directCalls).toBe(1);
		expect(stats.windowCalls).toBe(0);
		expect(stats.mergeCalls).toBe(0);
		expect(tokens).toEqual(['- ', 'direct']);
		expect(result.summary).toBe('- direct');
		expect(result.windows).toHaveLength(1);
		expect(result.windows[0].data).toMatchObject({
			summary: '- direct',
			analysisType: 'takeaways',
			direct: true
		});
	});

	test('climbs the ladder on a context overflow and restarts the attempt', async () => {
		const stats: StubStats = { windowCalls: 0, mergeCalls: 0, directCalls: 0 };
		const attempts: number[] = [];
		const result = await analyzeTakeaways(BODY, {
			divisor: 1,
			processor: stubProcessor(stats, { climbOnWholeBody: true }),
			onAttempt: (total) => attempts.push(total)
		});

		expect(attempts).toEqual([1, 2]);
		expect(stats.directCalls).toBe(1);
		expect(result.divisor).toBe(2);
		expect(stats.mergeCalls).toBe(1);
		expect(result.summary).toBe('- takeaway');
	});
});
