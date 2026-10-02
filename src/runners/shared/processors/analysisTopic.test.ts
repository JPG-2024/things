import { describe, expect, test } from 'bun:test';
import {
	buildBlog,
	clampCountForChunk,
	clusterFuzzyByLabel,
	ensureTopicPeriod,
	mergeSummaries,
	normalizeTopicLabel,
	pickBestLabel
} from './analysisTopicUtils';
import { stringArrayUpToGbnf } from '@/lib/utils/gbnf';

describe('normalizeTopicLabel', () => {
	test('caps words and ends with a single period', () => {
		expect(normalizeTopicLabel('"Machine learning models for search ranking!!"', 4)).toBe(
			'Machine learning models for.'
		);
	});

	test('returns empty for blank input', () => {
		expect(normalizeTopicLabel('   ...  ', 6)).toBe('');
	});
});

describe('clampCountForChunk', () => {
	test('requests fewer items for short chunks', () => {
		expect(clampCountForChunk('short text', 5, 800)).toBe(1);
	});

	test('allows full count for long chunks', () => {
		expect(clampCountForChunk('x'.repeat(5000), 5, 800)).toBe(5);
	});

	test('returns zero for empty chunks', () => {
		expect(clampCountForChunk('   ', 3, 800)).toBe(0);
	});
});

describe('mergeSummaries', () => {
	test('drops no-mention placeholders and near duplicates', () => {
		const merged = mergeSummaries([
			'No specific mention.',
			'Small models need short grounded prompts.',
			'Small models need short grounded prompts!'
		]);
		expect(merged).toBe('Small models need short grounded prompts.');
	});
});

describe('clusterFuzzyByLabel', () => {
	test('merges paraphrased labels without embeddings', () => {
		const clusters = clusterFuzzyByLabel([
			{ topic: 'Language models.', summary: 'A' },
			{ topic: 'language models', summary: 'B' },
			{ topic: 'Unrelated cooking.', summary: 'C' }
		]);
		expect(clusters.length).toBe(2);
		expect(clusters[0].summaries.length).toBe(2);
	});

	test('cluster labels end with a single dot', () => {
		const clusters = clusterFuzzyByLabel([
			{ topic: 'Language models', summary: 'A' },
			{ topic: 'language models...', summary: 'B' }
		]);
		expect(clusters[0].label).toBe('Language models.');
	});
});

describe('ensureTopicPeriod', () => {
	test('appends and collapses trailing dots idempotently', () => {
		expect(ensureTopicPeriod('Foo')).toBe('Foo.');
		expect(ensureTopicPeriod('Foo.')).toBe('Foo.');
		expect(ensureTopicPeriod('Foo...  ')).toBe('Foo.');
		expect(ensureTopicPeriod('')).toBe('');
		expect(ensureTopicPeriod('   ...  ')).toBe('');
	});

	test('pickBestLabel always returns a dotted topic', () => {
		expect(pickBestLabel(['Language models', 'language models...'])).toBe('Language models.');
		expect(pickBestLabel([])).toBe('');
	});
});

describe('buildBlog', () => {
	test('section topics and headers keep dots', () => {
		const { markdown, sections } = buildBlog([
			{
				label: 'Language models',
				labels: ['Language models'],
				embedding: [],
				members: 1,
				summaries: ['A']
			}
		]);
		expect(sections[0].topic).toBe('Language models.');
		expect(markdown).toContain('## Language models.\n\nA');
	});
});

describe('stringArrayUpToGbnf', () => {
	test('builds a grammar string', () => {
		const grammar = stringArrayUpToGbnf(3);
		expect(grammar).toContain('root ::=');
		expect(grammar).toContain('string ::=');
	});
});
