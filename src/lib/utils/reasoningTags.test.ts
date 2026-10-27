import { describe, expect, test } from 'bun:test';
import { createReasoningTagSplitter, splitThoughtTags } from './reasoningTags';

// Written as code points so no tool pipeline can mangle the raw tag text.
const OPEN = String.fromCharCode(60, 116, 104, 105, 110, 107, 62);
const CLOSE = String.fromCharCode(60, 47, 116, 104, 105, 110, 107, 62);

describe('createReasoningTagSplitter', () => {
	test('passes plain content through untouched', () => {
		const splitter = createReasoningTagSplitter();
		const parts = splitter.feed('hello world');
		expect(parts).toEqual({ reasoning: '', content: 'hello world' });
	});

	test('routes tagged thinking to reasoning without the tags', () => {
		const splitter = createReasoningTagSplitter();
		const parts = splitter.feed(OPEN + 'plan first: a, then b.' + CLOSE + 'Final answer.');
		expect(parts).toEqual({ reasoning: 'plan first: a, then b.', content: 'Final answer.' });
	});

	test('keeps streaming across an open tag cut in chunks', () => {
		const splitter = createReasoningTagSplitter();
		expect(splitter.feed('a ')).toEqual({ reasoning: '', content: 'a ' });
		expect(splitter.feed(OPEN.slice(0, 2))).toEqual({ reasoning: '', content: '' });
		expect(splitter.feed(OPEN.slice(2) + 'step one.' + CLOSE)).toEqual({
			reasoning: 'step one.',
			content: ''
		});
		expect(splitter.feed('The answer:')).toEqual({ reasoning: '', content: 'The answer:' });
	});

	test('holds back a trailing tag-prefix chunk until disambiguation', () => {
		const splitter = createReasoningTagSplitter();
		expect(splitter.feed('Numbers ' + OPEN.slice(0, 4))).toEqual({
			reasoning: '',
			content: 'Numbers '
		});
		expect(splitter.feed('n+1')).toEqual({
			reasoning: '',
			content: OPEN.slice(0, 4) + 'n+1'
		});
	});

	test('supports several thinking blocks in one stream', () => {
		const splitter = createReasoningTagSplitter();
		const parts = splitter.feed(OPEN + 'head.' + CLOSE + 'A' + OPEN + 'tail.' + CLOSE + 'B');
		expect(parts).toEqual({ reasoning: 'head.tail.', content: 'AB' });
	});

	test('flush returns text held back by a partial open tag', () => {
		const splitter = createReasoningTagSplitter();
		expect(splitter.feed('answer ends with ' + OPEN.slice(0, 4))).toEqual({
			reasoning: '',
			content: 'answer ends with '
		});
		expect(splitter.flush()).toEqual({ reasoning: '', content: OPEN.slice(0, 4) });
	});

	test('flush returns an unclosed thinking block as reasoning', () => {
		const splitter = createReasoningTagSplitter();
		expect(splitter.feed(OPEN + 'still ' + CLOSE.slice(0, 4))).toEqual({
			reasoning: 'still ',
			content: ''
		});
		expect(splitter.flush()).toEqual({ reasoning: CLOSE.slice(0, 4), content: '' });
	});
});

describe('splitThoughtTags', () => {
	test('splits a complete text in one call', () => {
		const parts = splitThoughtTags(
			'a ' + OPEN + 'think.' + CLOSE + ' b ' + OPEN + 'thrashing' + CLOSE + ' c'
		);
		expect(parts).toEqual({ reasoning: 'think.thrashing', content: 'a  b  c' });
	});
});
