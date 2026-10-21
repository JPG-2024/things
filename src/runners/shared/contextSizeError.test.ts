import { describe, expect, test } from 'bun:test';
import { isContextSizeError, isContextSizeErrorText } from './contextSizeError';

/** `LlamaChatCompletionError` stand-in: same duck-typed surface (`message`, `status`, `payload`). */
class FakeCompletionError extends Error {
	constructor(
		message: string,
		public status?: number,
		public payload?: unknown
	) {
		super(message);
	}
}

describe('isContextSizeErrorText', () => {
	test('matches the generic overflow phrasing sent by some servers', () => {
		expect(isContextSizeErrorText('Context size has been exceeded.')).toBe(true);
	});

	test('matches legacy llama.cpp phrasings', () => {
		expect(isContextSizeErrorText('the request exceeds the available context size')).toBe(true);
		expect(isContextSizeErrorText('exceed_context_size_error')).toBe(true);
	});

	test('matches reworded overflow messages', () => {
		expect(isContextSizeErrorText('prompt exceeds the context window size')).toBe(true);
	});

	test('does not match unrelated transport errors', () => {
		expect(isContextSizeErrorText('The operation was aborted')).toBe(false);
		expect(isContextSizeErrorText('fetch failed')).toBe(false);
		expect(isContextSizeErrorText('Internal Server Error')).toBe(false);
	});
});

describe('isContextSizeError', () => {
	test('matches the embedded server payload in error.message', () => {
		// Exact shape produced by the local llama-server path
		// (llama-completions.ts): `status statusText - JSON.stringify(payload.error)`.
		const error = new Error(
			'500 Internal Server Error - {"code":500,"message":"Context size has been exceeded.","type":"server_error"}'
		);
		expect(isContextSizeError(error)).toBe(true);
	});

	test('matches the structured payload of completion errors', () => {
		const error = new FakeCompletionError(
			'500 Internal Server Error - {"code":500,"message":"Context size has been exceeded.","type":"server_error"}',
			500,
			{ code: 500, message: 'Context size has been exceeded.', type: 'server_error' }
		);
		expect(isContextSizeError(error)).toBe(true);
	});

	test('matches wrapped { error: {...} } payloads with legacy type', () => {
		const error = new FakeCompletionError('context overflow', 400, {
			error: { type: 'exceed_context_size_error', message: 'irrelevant' }
		});
		expect(isContextSizeError(error)).toBe(true);
	});

	test('does not match abort and network errors', () => {
		const abort = new DOMException('The operation was aborted.', 'AbortError');
		expect(isContextSizeError(abort)).toBe(false);
		expect(isContextSizeError(new Error('fetch failed'))).toBe(false);
	});
});
