import { describe, expect, test } from 'bun:test';
import { analysisTopicGbnf } from './gbnf';

describe('analysisTopicGbnf', () => {
	test('forces exact topic and keyword counts in the root object', () => {
		const grammar = analysisTopicGbnf(2, 4);
		const rootRule = grammar.split('\n')[0];

		expect(rootRule).toContain('root ::= "{" ws "\\"topics\\"" ws ":" ws "["');
		expect(rootRule).toContain('"\\"keywords\\"" ws ":" ws "["');
		expect(rootRule.match(/ws topic/g)?.length).toBe(2);
		expect(rootRule.match(/ws string/g)?.length).toBe(4);
	});

	test('topic objects require label and summary strings', () => {
		const grammar = analysisTopicGbnf(1, 1);

		expect(grammar).toContain(
			'topic ::= "{" ws "\\"label\\"" ws ":" ws string ws "," ws "\\"summary\\"" ws ":" ws string ws "}"'
		);
	});

	test('clamps counts below 1 to a single item', () => {
		const grammar = analysisTopicGbnf(0, 0);
		const rootRule = grammar.split('\n')[0];

		expect(rootRule.match(/ws topic/g)?.length).toBe(1);
		expect(rootRule.match(/ws string/g)?.length).toBe(1);
	});
});
