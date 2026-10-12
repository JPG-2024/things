import { describe, expect, test } from 'bun:test';
import { sanitizeTitle } from './titleText';

const wide = { maxWords: 50, maxChars: 500 };

describe('sanitizeTitle', () => {
	test('strips headings and list markers, keeping numeric-leading titles', () => {
		expect(sanitizeTitle('# The title', wide)).toBe('The title');
		expect(sanitizeTitle('- The title', wide)).toBe('The title');
		expect(sanitizeTitle('1. The title', wide)).toBe('The title');
		expect(sanitizeTitle('2) The title', wide)).toBe('The title');
		expect(sanitizeTitle('5 Key Ideas', wide)).toBe('5 Key Ideas');
		expect(sanitizeTitle('2024 Election', wide)).toBe('2024 Election');
	});

	test('unwraps fences, quotes and emphasis, innermost first', () => {
		expect(sanitizeTitle('```The title```', wide)).toBe('The title');
		expect(sanitizeTitle('"The title"', wide)).toBe('The title');
		expect(sanitizeTitle('«The title»', wide)).toBe('The title');
		expect(sanitizeTitle('**The title**', wide)).toBe('The title');
		expect(sanitizeTitle('**"The title"**', wide)).toBe('The title');
		expect(sanitizeTitle('_“The title”_', wide)).toBe('The title');
	});

	test('collapses whitespace and drops trailing punctuation', () => {
		expect(sanitizeTitle('  The   title  ', wide)).toBe('The title');
		expect(sanitizeTitle('The title.', wide)).toBe('The title');
		expect(sanitizeTitle('"The Main Topic."', wide)).toBe('The Main Topic');
	});

	test('keeps only the first clause when separators are given', () => {
		expect(sanitizeTitle('Main Topic – a subtitle', { ...wide, separators: /\s+[–—-]\s+/ })).toBe(
			'Main Topic'
		);
		expect(sanitizeTitle('Main Topic: a subtitle', { ...wide, separators: /\s*:\s+/ })).toBe(
			'Main Topic'
		);
	});

	test('clamps to the word budget', () => {
		const words = Array.from({ length: 25 }, (_, i) => `w${i}`).join(' ');
		expect(sanitizeTitle(words, { maxWords: 20, maxChars: 500 })).toBe(
			Array.from({ length: 20 }, (_, i) => `w${i}`).join(' ')
		);
	});

	test('clamps the character budget at a word boundary, or raw-cut for CJK', () => {
		expect(sanitizeTitle('aaa bbb ccc', { maxWords: 50, maxChars: 5 })).toBe('aaa');
		expect(sanitizeTitle('日本語のタイトル', { maxWords: 50, maxChars: 3 })).toBe('日本語');
	});

	test('drops a trailing connector only when a clip happened', () => {
		expect(
			sanitizeTitle('alpha beta de gamma', { maxWords: 3, maxChars: 500, stripConnectors: true })
		).toBe('alpha beta');
		expect(
			sanitizeTitle('alpha beta de gamma', { maxWords: 3, maxChars: 500, stripConnectors: false })
		).toBe('alpha beta de');
		expect(
			sanitizeTitle('alpha beta de', { maxWords: 50, maxChars: 500, stripConnectors: true })
		).toBe('alpha beta de');
	});

	test('keeps at least one word when stripping connectors', () => {
		expect(sanitizeTitle('de la', { maxWords: 1, maxChars: 500, stripConnectors: true })).toBe(
			'de'
		);
	});

	test('returns empty string for unusable output', () => {
		expect(sanitizeTitle('', wide)).toBe('');
		expect(sanitizeTitle('   ', wide)).toBe('');
		expect(sanitizeTitle('"  "', wide)).toBe('');
	});
});
