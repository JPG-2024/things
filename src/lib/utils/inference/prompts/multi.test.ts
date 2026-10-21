import { describe, expect, test } from 'bun:test';
import { MULTI_FINAL_USER_MESSAGE, buildMultiFieldUserMessage } from './multi';

describe('buildMultiFieldUserMessage', () => {
	test('asks for a direct opening instead of a section meta phrase', () => {
		const message = buildMultiFieldUserMessage(4, 3);

		expect(message).not.toContain('this section describes..');
		expect(message).toContain('Start the summary directly');
		expect(message).toContain('never open with meta phrases');
	});

	test('keeps the requested keyword and topic counts', () => {
		const message = buildMultiFieldUserMessage(6, 2);

		expect(message).toContain('exactly 6 specific keywords');
		expect(message).toContain('exactly 2 topic');
	});
});

describe('MULTI_FINAL_USER_MESSAGE', () => {
	test('asks the combined summary to avoid meta openers too', () => {
		expect(MULTI_FINAL_USER_MESSAGE).toContain('Start directly with the most relevant subject');
		expect(MULTI_FINAL_USER_MESSAGE).toContain('never open with meta phrases');
	});
});
