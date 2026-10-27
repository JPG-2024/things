import { describe, expect, test } from 'bun:test';
import {
	cancelRun,
	isRunCancelled,
	isRunCancelledError,
	resumeRun,
	RunCancelledError,
	throwIfRunCancelled
} from './runCancellation';

describe('run cancellation', () => {
	test('a run only aborts once its url is cancelled', () => {
		const url = 'https://www.youtube.com/watch?v=cancel-me';

		expect(isRunCancelled(url)).toBe(false);
		expect(() => throwIfRunCancelled(url)).not.toThrow();

		cancelRun(url);

		expect(isRunCancelled(url)).toBe(true);
		expect(() => throwIfRunCancelled(url)).toThrow(RunCancelledError);
	});

	test('resuming an url lets it be captured again', () => {
		const url = 'https://www.youtube.com/watch?v=resume-me';
		cancelRun(url);
		resumeRun(url);

		expect(isRunCancelled(url)).toBe(false);
		expect(() => throwIfRunCancelled(url)).not.toThrow();
	});

	test('a cancelled url never cancels another one', () => {
		cancelRun('https://www.youtube.com/watch?v=other');
		resumeRun('https://www.youtube.com/watch?v=mine');

		expect(isRunCancelled('https://www.youtube.com/watch?v=mine')).toBe(false);
	});

	test('the abort signal is recognized among unknown errors', () => {
		const abort = new RunCancelledError('https://example.com');
		expect(isRunCancelledError(abort)).toBe(true);
		expect(isRunCancelledError(new Error('boom'))).toBe(false);
		expect(isRunCancelledError('boom')).toBe(false);
	});
});
