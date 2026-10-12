import { describe, expect, test } from 'bun:test';
import {
	assistantAnswerText,
	assistantText,
	messageContentText,
	stripThinkBlocks
} from './assistant-text';
import type {
	LlamaChatCompletionsResponse,
	LlamaChatMessageContentPart
} from './llama-completions';

const response = (message: {
	content?: string | LlamaChatMessageContentPart[] | null;
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

	test('flattens array content parts', () => {
		expect(
			assistantAnswerText(response({ content: [{ type: 'text', text: 'final answer' }] }))
		).toBe('final answer');
	});

	test('skips non-text content parts', () => {
		expect(
			assistantAnswerText(
				response({
					content: [
						{ type: 'image_url', image_url: { url: 'https://example.com/x.png' } },
						{ type: 'text', text: 'answer' }
					]
				})
			)
		).toBe('answer');
	});
});

describe('messageContentText', () => {
	test('joins text parts and ignores the rest', () => {
		expect(
			messageContentText([
				{ type: 'text', text: 'a' },
				{ type: 'input_text', text: 'b' },
				{ type: 'image_url', image_url: { url: 'https://example.com/x.png' } }
			])
		).toBe('ab');
	});

	test('returns empty string for null, undefined or empty arrays', () => {
		expect(messageContentText(null)).toBe('');
		expect(messageContentText(undefined)).toBe('');
		expect(messageContentText([])).toBe('');
	});
});

describe('stripThinkBlocks', () => {
	const thinkOpen = `<${'think'}>`;
	const thinkClose = `</${'think'}>`;

	test('removes every block, not just the first', () => {
		expect(stripThinkBlocks(`${thinkOpen}one${thinkClose}A${thinkOpen}two${thinkClose}B`)).toBe(
			'AB'
		);
	});

	test('treats a leading lone opener as the rest of the trace', () => {
		expect(stripThinkBlocks(`${thinkOpen}still thinking`)).toBe('');
	});

	test('keeps a lone opener that is not at the start', () => {
		expect(stripThinkBlocks(`plain${thinkOpen}still thinking`)).toBe(
			`plain${thinkOpen}still thinking`
		);
	});

	test('leaves plain text untouched', () => {
		expect(stripThinkBlocks('just an answer')).toBe('just an answer');
	});
});
