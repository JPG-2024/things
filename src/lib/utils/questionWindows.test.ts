import { describe, expect, test } from 'bun:test';
import { answerWindows, type QuestionCompletionFn } from './questionWindows';

/** A body whose whole-text form overflows but whose halves fit. */
const BODY = 'a'.repeat(1000);
const WHOLE_BODY_MARKER = 'a'.repeat(1000);

function contextError(): Error {
	return new Error('exceed_context_size_error: prompt exceeds the available context size');
}

/** Completion that rejects the whole-body window and answers everything else. */
const climbsOnWholeBody: QuestionCompletionFn = async (messages) => {
	const user = messages[messages.length - 1].content;
	if (user.includes(WHOLE_BODY_MARKER)) throw contextError();
	return 'partial answer';
};

describe('answerWindows', () => {
	test('a fitting body answers in one streamed call', async () => {
		const calls: boolean[] = [];
		const result = await answerWindows(BODY, 'q?', {
			complete: async (_messages, options) => {
				calls.push(typeof options.onToken === 'function');
				return 'final answer';
			},
			onToken: () => {}
		});

		expect(result.divisor).toBe(1);
		expect(result.answer).toBe('final answer');
		// Single window: the call itself is the final one, so it streams.
		expect(calls).toEqual([true]);
	});

	test('climbs the ladder when the whole body overflows', async () => {
		let mergeCalls = 0;
		let windowCalls = 0;
		const complete: QuestionCompletionFn = async (messages) => {
			const user = messages[messages.length - 1].content;
			if (user.includes(WHOLE_BODY_MARKER)) throw contextError();
			if (user.includes('Merge the partial answers')) mergeCalls++;
			else windowCalls++;
			return 'partial answer';
		};

		const result = await answerWindows(BODY, 'q?', { complete });

		// Divisor 2: two window calls plus one merge call.
		expect(result.divisor).toBe(2);
		expect(windowCalls).toBe(2);
		expect(mergeCalls).toBe(1);
	});

	test('starts at the remembered divisor instead of the whole body', async () => {
		let wholeBodySent = false;
		const complete: QuestionCompletionFn = async (messages) => {
			const user = messages[messages.length - 1].content;
			if (user.includes(WHOLE_BODY_MARKER)) {
				wholeBodySent = true;
				throw contextError();
			}
			return 'partial answer';
		};

		const result = await answerWindows(BODY, 'q?', { complete, startDivisor: 2 });

		expect(result.divisor).toBe(2);
		expect(wholeBodySent).toBe(false);
	});

	test('rethrows the context error when the ladder is exhausted', async () => {
		const complete: QuestionCompletionFn = async () => {
			throw contextError();
		};

		expect(answerWindows(BODY, 'q?', { complete })).rejects.toThrow('exceed_context_size_error');
	});

	test('propagates an abort without climbing', async () => {
		const controller = new AbortController();
		controller.abort();
		let calls = 0;
		const complete: QuestionCompletionFn = async () => {
			calls++;
			return 'partial answer';
		};

		await expect(
			answerWindows(BODY, 'q?', { complete, signal: controller.signal })
		).rejects.toThrow();
		expect(calls).toBe(0);
	});

	test('a non-context error aborts the run without climbing', async () => {
		let calls = 0;
		const complete: QuestionCompletionFn = async () => {
			calls++;
			throw new Error('boom');
		};

		await expect(answerWindows(BODY, 'q?', { complete })).rejects.toThrow('boom');
		expect(calls).toBe(1);
	});

	test('reports attempt and window progress', async () => {
		const attempts: number[] = [];
		const windows: Array<[number, number]> = [];

		await answerWindows(BODY, 'q?', {
			complete: climbsOnWholeBody,
			onAttempt: (total) => attempts.push(total),
			onWindow: (index, total) => windows.push([index, total])
		});

		// The overflowing divisor-1 attempt reports too, then the divisor-2 run.
		expect(attempts).toEqual([1, 2]);
		expect(windows).toEqual([
			[0, 2],
			[1, 2]
		]);
	});

	test('prior history precedes the question in the calls', async () => {
		const messageCounts: number[] = [];
		await answerWindows(BODY, 'q?', {
			complete: async (messages) => {
				messageCounts.push(messages.length);
				return 'final answer';
			},
			history: [
				{ role: 'user', content: 'hi' },
				{ role: 'assistant', content: 'hello' }
			]
		});

		// No system prompt here: history (2) + the question.
		expect(messageCounts).toEqual([3]);
	});

	test('an empty body answers with an empty string', async () => {
		const result = await answerWindows('', 'q?', {
			complete: async () => 'partial answer'
		});

		expect(result.answer).toBe('');
	});
});
