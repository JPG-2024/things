import { describe, expect, test } from 'bun:test';
import {
	parseSplitConsolidateResponse,
	parseSplitSummaryResponse,
	parseSplitTopicsResponse
} from './analysisTopicSplitParse';

const topicsPayload = JSON.stringify({
	topics: [
		{ label: 'Local inference', summary: 'Running models on device.' },
		{ label: 'Quantization', summary: 'Reducing weight precision.' }
	],
	keywords: ['llama.cpp', 'GGUF', 'llama.cpp', '  ', 'quantization']
});

describe('parseSplitTopicsResponse', () => {
	test('parses a clean JSON object and dedupes keywords', () => {
		const data = parseSplitTopicsResponse(topicsPayload);

		expect(data.topics).toEqual([
			{ topic: 'Local inference', summary: 'Running models on device.' },
			{ topic: 'Quantization', summary: 'Reducing weight precision.' }
		]);
		expect(data.keywords).toEqual(['llama.cpp', 'GGUF', 'quantization']);
	});

	test('salvages a JSON object wrapped in a code fence', () => {
		const data = parseSplitTopicsResponse('```json\n' + topicsPayload + '\n```');

		expect(data.topics).toHaveLength(2);
		expect(data.keywords).toEqual(['llama.cpp', 'GGUF', 'quantization']);
	});

	test('salvages a JSON object embedded in prose', () => {
		const data = parseSplitTopicsResponse('Here you go:\n' + topicsPayload + '\nHope that helps.');

		expect(data.topics).toHaveLength(2);
	});

	test('drops entries with missing or non-string fields', () => {
		const payload = JSON.stringify({
			topics: [
				{ label: 'Ok topic', summary: 'Fine.' },
				{ label: 'No summary' },
				{ summary: 'No label' },
				'not an object',
				null
			],
			keywords: 'not an array'
		});

		const data = parseSplitTopicsResponse(payload);

		expect(data.topics).toEqual([{ topic: 'Ok topic', summary: 'Fine.' }]);
		expect(data.keywords).toEqual([]);
	});

	test('returns the empty shape for unusable output', () => {
		for (const text of ['', '   ', 'no json here', '{"topics": truncated']) {
			expect(parseSplitTopicsResponse(text)).toEqual({ topics: [], keywords: [] });
		}
	});
});

describe('parseSplitSummaryResponse', () => {
	test('parses a clean JSON object', () => {
		const data = parseSplitSummaryResponse(
			JSON.stringify({ title: 'A short title', summary: 'One paragraph.' })
		);

		expect(data).toEqual({ title: 'A short title', summary: 'One paragraph.' });
	});

	test('salvages a fenced JSON object', () => {
		const data = parseSplitSummaryResponse('```\n{"title": "T", "summary": "S"}\n```');

		expect(data).toEqual({ title: 'T', summary: 'S' });
	});

	test('tolerates missing fields as empty strings', () => {
		const data = parseSplitSummaryResponse(JSON.stringify({ summary: 'Only summary.' }));

		expect(data).toEqual({ title: '', summary: 'Only summary.' });
	});

	test('returns the empty shape for arrays and garbage', () => {
		for (const text of ['', '[1, 2, 3]', 'broken {json']) {
			expect(parseSplitSummaryResponse(text)).toEqual({ title: '', summary: '' });
		}
	});
});

describe('parseSplitConsolidateResponse', () => {
	test('parses a bare JSON array of labels positionally', () => {
		const labels = parseSplitConsolidateResponse(
			JSON.stringify(['Local inference', 'Quantization']),
			2
		);

		expect(labels).toEqual(['Local inference', 'Quantization']);
	});

	test('salvages a fenced JSON array', () => {
		const labels = parseSplitConsolidateResponse('```json\n["A", "B"]\n```', 2);

		expect(labels).toEqual(['A', 'B']);
	});

	test('trims label whitespace', () => {
		const labels = parseSplitConsolidateResponse(JSON.stringify(['  A  ', 'B']), 2);

		expect(labels).toEqual(['A', 'B']);
	});

	test('rejects a count mismatch so positions never shift', () => {
		expect(parseSplitConsolidateResponse(JSON.stringify(['A']), 2)).toBeNull();
		expect(parseSplitConsolidateResponse(JSON.stringify(['A', 'B', 'C']), 2)).toBeNull();
	});

	test('rejects non-arrays and non-string entries', () => {
		expect(parseSplitConsolidateResponse('{"topics": ["A"]}', 1)).toBeNull();
		expect(parseSplitConsolidateResponse(JSON.stringify(['A', 2]), 2)).toBeNull();
		expect(parseSplitConsolidateResponse('not json', 1)).toBeNull();
	});
});
