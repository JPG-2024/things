import { describe, expect, test } from 'bun:test';
import { parseTitleText, stripFinalResponse } from './finalResponse';

// The literal tag sequence is assembled here because the repo strips it from
// any authored source; see `assistant-text.ts`.
const thinkOpen = `<${'think'}>`;
const thinkClose = `</${'think'}>`;

describe('stripFinalResponse', () => {
	test('keeps the answer that follows the last separator line', () => {
		const raw = [
			'Let me understand. We need a short title in Spanish for this content.',
			'',
			'---',
			'',
			'La paradoja de la automatización'
		].join('\n');

		expect(stripFinalResponse(raw)).toBe('La paradoja de la automatización');
	});

	test('handles asterisk and underscore separators', () => {
		expect(stripFinalResponse('trace\n\n***\n\nTitle A')).toBe('Title A');
		expect(stripFinalResponse('trace\n\n___\n\nTitle B')).toBe('Title B');
	});

	test('returns the whole text when there is no separator', () => {
		expect(stripFinalResponse('A plain title')).toBe('A plain title');
	});

	test('prefers the text after an explicit answer marker', () => {
		expect(stripFinalResponse('trace\n\nFinal answer: The real title')).toBe('The real title');
		expect(stripFinalResponse('trace\n\nFinal response: The real title')).toBe('The real title');
	});

	test('ignores markers that do not start their line', () => {
		expect(stripFinalResponse('trace\n\nRESPUESTA FINAL:: no marker')).toBe('trace');
	});

	test('strips thinking blocks before looking for a separator', () => {
		expect(stripFinalResponse(`${thinkOpen}plan${thinkClose}The title`)).toBe('The title');
	});

	test('returns empty string when the turn never reached an answer', () => {
		expect(stripFinalResponse('')).toBe('');
		expect(stripFinalResponse('   \n  ')).toBe('');
		expect(stripFinalResponse(`${thinkOpen}still thinking`)).toBe('');
	});
});

describe('parseTitleText', () => {
	test('extracts the title out of a full reasoning turn', () => {
		const raw = [
			'Let me understand. We need to produce a short title (max 20 words) in Spanish.',
			'The context is IA y desarrollo and the paradox of automation.',
			'',
			'---',
			'',
			'La paradoja de la automatización en el desarrollo de software'
		].join('\n');

		expect(parseTitleText(raw)).toBe(
			'La paradoja de la automatización en el desarrollo de software'
		);
	});

	test('strips quotes, emphasis, headings and list markers', () => {
		expect(parseTitleText('"The title"')).toBe('The title');
		expect(parseTitleText('```The title```')).toBe('The title');
		expect(parseTitleText('# The title')).toBe('The title');
		expect(parseTitleText('- The title')).toBe('The title');
		expect(parseTitleText('1. The title')).toBe('The title');
		expect(parseTitleText('**The title**')).toBe('The title');
		expect(parseTitleText('**"The title"**')).toBe('The title');
		expect(parseTitleText('«The title»')).toBe('The title');
		expect(parseTitleText('_“The title”_')).toBe('The title');
	});

	test('drops the trailing period the stylesheet already adds', () => {
		expect(parseTitleText('The title.')).toBe('The title');
	});

	test('collapses whitespace inside a single line', () => {
		expect(parseTitleText('  The   title  ')).toBe('The title');
	});

	test('keeps only the first line of a wrapped answer', () => {
		expect(parseTitleText('  The\n\ntitle  ')).toBe('The');
	});

	test('clamps to the word budget', () => {
		const words = Array.from({ length: 25 }, (_, i) => `w${i}`).join(' ');
		expect(parseTitleText(words)).toBe(Array.from({ length: 20 }, (_, i) => `w${i}`).join(' '));
	});

	test('honors a custom word budget', () => {
		expect(parseTitleText('one two three four', 2)).toBe('one two');
	});

	test('returns empty string for unusable output', () => {
		expect(parseTitleText('')).toBe('');
		expect(parseTitleText('---\n\n"  "')).toBe('');
	});
});
