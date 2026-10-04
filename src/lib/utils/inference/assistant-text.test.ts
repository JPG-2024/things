import { describe, expect, test } from 'bun:test';
import { assistantAnswerText, assistantText } from './assistant-text';
import type { LlamaChatCompletionsResponse } from './llama-completions';

const response = (message: {
	content?: string | null;
	reasoning_content?: string | null;
}): LlamaChatCompletionsResponse => ({
	id: 'test',
	object: 'chat.completion',
	created: 0,
	model: 'test-model',
	choices: [
		{
			index: 0,
			message: {
				role: 'assistant',
				content: message.content ?? null,
				...(message.reasoning_content ? { reasoning_content: message.reasoning_content } : {})
			},
			finish_reason: 'stop'
		}
	]
});

describe('assistantText', () => {
	test('returns the string content as-is', () => {
		expect(assistantText(response({ content: '{"topics": []}' }))).toBe('{"topics": []}');
	});

	test('returns empty string for null or missing content', () => {
		expect(assistantText(response({ content: null }))).toBe('');
		expect(assistantText(undefined)).toBe('');
	});
});

describe('assistantAnswerText', () => {
	test('prefers content over the reasoning trace', () => {
		expect(
			assistantAnswerText(
				response({ content: '{"topics": []}', reasoning_content: 'Let me think...' })
			)
		).toBe('{"topics": []}');
	});

	test('falls back to reasoning_content when content is empty', () => {
		expect(
			assistantAnswerText(
				response({
					content: '',
					reasoning_content: '{\n  "topics": [\n    {\n      "label": "X"\n'
				})
			)
		).toBe('{\n  "topics": [\n    {\n      "label": "X"');
	});

	test('falls back to reasoning_content when content is null', () => {
		expect(assistantAnswerText(response({ reasoning_content: 'final answer' }))).toBe(
			'final answer'
		);
	});

	test('strips paired think blocks out of content', () => {
		expect(
			assistantAnswerText(response({ content: '<think>Plan first.</think>{"topics": []}' }))
		).toBe('{"topics": []}');
	});

	test('discards an unterminated think block as still-thinking output', () => {
		expect(assistantAnswerText(response({ content: '<think>partial{"topics": []}' }))).toBe('');
	});

	test('returns empty string when neither field has usable text', () => {
		expect(assistantAnswerText(response({ content: null, reasoning_content: null }))).toBe('');
		expect(assistantAnswerText(undefined)).toBe('');
	});
});
