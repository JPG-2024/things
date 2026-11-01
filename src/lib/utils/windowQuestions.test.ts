import { describe, expect, test } from 'bun:test';
import { questionsForChunk, readWindowQuestions } from './windowQuestions';

describe('readWindowQuestions', () => {
	test('returns the questions of a valid payload', () => {
		expect(readWindowQuestions({ summary: 's', questions: ['First?', 'Second?'] })).toEqual([
			'First?',
			'Second?'
		]);
	});

	test('ignores extra payload keys', () => {
		expect(readWindowQuestions({ summary: 's', questions: ['A?', 'B?'], title: 'T' })).toEqual([
			'A?',
			'B?'
		]);
	});

	test('drops blank and non-string entries, trims the rest', () => {
		expect(readWindowQuestions({ summary: 's', questions: [' A? ', '   ', 42, null] })).toEqual([
			'A?'
		]);
	});

	test('returns empty for payloads without usable questions', () => {
		expect(readWindowQuestions({ summary: 's' })).toEqual([]);
		expect(readWindowQuestions({ summary: 's', questions: 'not an array' })).toEqual([]);
		expect(readWindowQuestions({ summary: 's', questions: [] })).toEqual([]);
	});
});

describe('questionsForChunk', () => {
	test('a small window answers the base count', () => {
		expect(questionsForChunk('a'.repeat(5_000))).toBe(2);
	});

	test('the count grows with the window size', () => {
		expect(questionsForChunk('a'.repeat(10_000))).toBe(3);
		expect(questionsForChunk('a'.repeat(25_000))).toBe(4);
	});

	test('the count is capped', () => {
		expect(questionsForChunk('a'.repeat(100_000))).toBe(5);
		expect(questionsForChunk('a'.repeat(1_000_000))).toBe(5);
	});
});
