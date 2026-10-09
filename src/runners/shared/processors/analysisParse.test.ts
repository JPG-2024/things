import { describe, expect, test } from 'bun:test';
import {
	buildWindowBlocks,
	normalizeWindowTitle,
	parseAnalysisTopicResponse,
	uniqueStrings
} from './analysisParse';

describe('parseAnalysisTopicResponse', () => {
	test('parses title, summary, topics and keywords', () => {
		const result = parseAnalysisTopicResponse(
			'{"title":"Main topic","summary":"One paragraph.","topics":[{"label":"Alpha","summary":"Alpha summary."}],"keywords":["a","b","a"]}'
		);
		expect(result.title).toBe('Main topic');
		expect(result.summary).toBe('One paragraph.');
		expect(result.topics).toEqual(['Alpha']);
		expect(result.sections).toEqual([{ topic: 'Alpha', summary: 'Alpha summary.' }]);
		expect(result.keywords).toEqual(['a', 'b']);
	});

	test('tolerates a missing title/summary (legacy or field-omitting model)', () => {
		const result = parseAnalysisTopicResponse(
			'{"topics":[{"label":"Alpha","summary":"Alpha summary."}],"keywords":[]}'
		);
		expect(result.title).toBe('');
		expect(result.summary).toBe('');
		expect(result.sections).toEqual([{ topic: 'Alpha', summary: 'Alpha summary.' }]);
	});

	test('salvages an object wrapped in a code fence or prose', () => {
		const result = parseAnalysisTopicResponse(
			'Sure! Here it is:\n```json\n{"title":"T","summary":"S","topics":[],"keywords":[]}\n```'
		);
		expect(result.title).toBe('T');
		expect(result.summary).toBe('S');
	});

	test('falls back to the empty shape on unusable output', () => {
		expect(parseAnalysisTopicResponse('no json here')).toEqual({
			title: '',
			summary: '',
			topics: [],
			keywords: [],
			sections: []
		});
	});
});

describe('buildWindowBlocks', () => {
	test('renders `## title` above the window summary', () => {
		const markdown = buildWindowBlocks([
			{
				title: 'The topic',
				summary: 'One paragraph.',
				topics: ['Alpha'],
				keywords: [],
				sections: [{ topic: 'Alpha', summary: 'Alpha summary.' }]
			}
		]);
		expect(markdown).toBe('## The topic\n\nOne paragraph.');
	});

	test('renders a bare paragraph when the title is missing', () => {
		const markdown = buildWindowBlocks([
			{
				title: '',
				summary: 'One paragraph.',
				topics: [],
				keywords: [],
				sections: []
			}
		]);
		expect(markdown).toBe('One paragraph.');
	});

	test('legacy shape (no title/summary) falls back to stitched topic summaries, heading-less', () => {
		const markdown = buildWindowBlocks([
			{
				topics: ['Alpha', 'Beta'],
				keywords: [],
				sections: [
					{ topic: 'Alpha', summary: 'Alpha summary.' },
					{ topic: 'Beta', summary: 'Beta summary.' }
				]
			} as {
				title?: string;
				summary?: string;
				topics: string[];
				keywords: string[];
				sections: { topic: string; summary: string }[];
			}
		]);
		expect(markdown).toBe('Alpha summary.\n\nBeta summary.');
	});

	test('joins one block per window and skips fully empty windows', () => {
		const markdown = buildWindowBlocks([
			{
				title: 'First',
				summary: 'First paragraph.',
				topics: [],
				keywords: [],
				sections: []
			},
			{ title: '', summary: '', topics: [], keywords: [], sections: [] }
		]);
		expect(markdown).toBe('## First\n\nFirst paragraph.');
	});
});

describe('normalizeWindowTitle', () => {
	test('strips markdown hashes, quotes and trailing punctuation', () => {
		expect(normalizeWindowTitle('### "The Main Topic."')).toBe('The Main Topic');
	});

	test('keeps numeric-leading titles but strips list markers', () => {
		expect(normalizeWindowTitle('5 Key Ideas')).toBe('5 Key Ideas');
		expect(normalizeWindowTitle('2024 Election')).toBe('2024 Election');
		expect(normalizeWindowTitle('1. The Main Topic')).toBe('The Main Topic');
		expect(normalizeWindowTitle('2) Second Point')).toBe('Second Point');
		expect(normalizeWindowTitle('- Bulleted Title')).toBe('Bulleted Title');
	});

	test('caps to 8 words and drops separator suffixes', () => {
		expect(
			normalizeWindowTitle('One Two Three Four Five Six Seven Eight Nine Ten – and even more')
		).toBe('One Two Three Four Five Six Seven Eight');
		expect(normalizeWindowTitle('')).toBe('');
	});
});

describe('uniqueStrings', () => {
	test('trims, drops blanks and case-insensitively dedupes', () => {
		expect(uniqueStrings([' a ', 'A', '', 'b'])).toEqual(['a', 'b']);
	});

	test('a custom key controls the dedupe lookup without transforming values', () => {
		expect(uniqueStrings(['A', 'a'], (value) => value)).toEqual(['A', 'a']);
	});
});
