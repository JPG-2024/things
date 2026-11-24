import { describe, expect, test } from 'bun:test';
import { translateMarkdown, type TranslationCompletionFn } from './translation';

function contextError(): Error {
	return new Error('exceed_context_size_error: prompt exceeds the available context size');
}

/** A body whose whole-text form overflows but whose halves fit. */
const BODY = 'a'.repeat(1000);

describe('translateMarkdown', () => {
	test('a fitting body translates in one call', async () => {
		const calls: Array<{ text: string; langName: string }> = [];
		const result = await translateMarkdown('single request body', 'es', {
			complete: async (text, langName) => {
				calls.push({ text, langName });
				return 'cuerpo traducido';
			}
		});

		expect(result).toBe('cuerpo traducido');
		expect(calls).toEqual([{ text: 'single request body', langName: 'Spanish' }]);
	});

	test('the same body and language are served from the cache', async () => {
		let calls = 0;
		const complete: TranslationCompletionFn = async () => {
			calls++;
			return 'cached result';
		};

		const first = await translateMarkdown('cache probe body', 'fr', { complete });
		const second = await translateMarkdown('cache probe body', 'fr', { complete });

		expect(first).toBe('cached result');
		expect(second).toBe('cached result');
		expect(calls).toBe(1);
	});

	test('climbs the ladder when the whole body overflows', async () => {
		let wholeCalls = 0;
		let chunkCalls = 0;
		const progress: Array<[number, number]> = [];
		const complete: TranslationCompletionFn = async (text) => {
			if (text === BODY) {
				wholeCalls++;
				throw contextError();
			}
			chunkCalls++;
			return `[es:${text.length}]`;
		};

		const result = await translateMarkdown(BODY, 'es', {
			complete,
			onProgress: (done, total) => progress.push([done, total])
		});

		expect(wholeCalls).toBe(1);
		// Divisor 2: two zero-overlap chunks, concatenated.
		expect(chunkCalls).toBe(2);
		expect(result.split('\n\n')).toHaveLength(2);
		expect(progress).toEqual([
			[1, 2],
			[2, 2]
		]);
	});

	test('rethrows the context error when the ladder is exhausted', async () => {
		const complete: TranslationCompletionFn = async () => {
			throw contextError();
		};

		await expect(translateMarkdown('exhausted ladder body', 'es', { complete })).rejects.toThrow(
			'exceed_context_size_error'
		);
	});

	test('propagates a non-context error without climbing', async () => {
		let calls = 0;
		const complete: TranslationCompletionFn = async () => {
			calls++;
			throw new Error('server exploded');
		};

		await expect(
			translateMarkdown('non context error body', 'es', { complete })
		).rejects.toThrow('server exploded');
		expect(calls).toBe(1);
	});

	test('propagates an abort without climbing', async () => {
		const controller = new AbortController();
		controller.abort();
		let calls = 0;
		const complete: TranslationCompletionFn = async () => {
			calls++;
			return 'never';
		};

		await expect(
			translateMarkdown('aborted body', 'es', { complete, signal: controller.signal })
		).rejects.toThrow('Aborted');
		expect(calls).toBe(0);
	});

	test('an empty body returns untouched without a call', async () => {
		let calls = 0;
		const complete: TranslationCompletionFn = async () => {
			calls++;
			return 'never';
		};

		const result = await translateMarkdown('   ', 'es', { complete });
		expect(result).toBe('   ');
		expect(calls).toBe(0);
	});
});
