import { describe, expect, test } from 'bun:test';
import { parseMultiFieldResponse } from './multiParse';
import type { MultiFieldSpec } from '@/lib/utils/gbnf';

const FIELDS: MultiFieldSpec[] = [
	{ key: 'summary', kind: 'string' },
	{ key: 'keywords', kind: 'string-array', count: 4 },
	{ key: 'topics', kind: 'string-array', count: 3 }
];

describe('parseMultiFieldResponse', () => {
	test('parses a strict JSON object', () => {
		const result = parseMultiFieldResponse(
			'{"summary":"A takeaway.","keywords":["a","b","c","d"],"topics":["x","y","z"]}',
			FIELDS
		);
		expect(result).toEqual({
			summary: ['A takeaway.'],
			keywords: ['a', 'b', 'c', 'd'],
			topics: ['x', 'y', 'z']
		});
	});

	test('salvages an object wrapped in a code fence or prose', () => {
		const result = parseMultiFieldResponse(
			'Sure! Here it is:\n```json\n{"summary":"S","keywords":["a"],"topics":["t"]}\n```',
			FIELDS
		);
		expect(result).toEqual({ summary: ['S'], keywords: ['a'], topics: ['t'] });
	});

	test('parses the reasoner-style trace that starts with the object', () => {
		// Shape observed from LFM2.5: the answer lands in reasoning_content.
		const result = parseMultiFieldResponse(
			'{\n  "summary": "S",\n  "keywords": ["a"],\n  "topics": ["t"]\n}',
			FIELDS
		);
		expect(result.summary).toEqual(['S']);
	});

	test('dedupes and trims array values, dropping blanks', () => {
		const result = parseMultiFieldResponse(
			'{"summary":"S","keywords":[" a ","a","","b"],"topics":["t","t"]}',
			FIELDS
		);
		expect(result.keywords).toEqual(['a', 'b']);
		expect(result.topics).toEqual(['t']);
	});

	test('falls back to the empty shape on unusable output', () => {
		expect(parseMultiFieldResponse('', FIELDS)).toEqual({
			summary: [''],
			keywords: [],
			topics: []
		});
		expect(parseMultiFieldResponse('no json here', FIELDS)).toEqual({
			summary: [''],
			keywords: [],
			topics: []
		});
	});

	test('coerces a non-string summary value to an empty string', () => {
		const result = parseMultiFieldResponse('{"summary":42,"keywords":[],"topics":[]}', FIELDS);
		expect(result.summary).toEqual(['']);
	});
});
