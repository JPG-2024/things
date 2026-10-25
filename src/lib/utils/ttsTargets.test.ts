import { describe, expect, test } from 'bun:test';
import { hashText, resolveTargetIdFromElement } from './ttsTargets';

describe('hashText', () => {
	test('is stable across calls', () => {
		expect(hashText('Hola mundo')).toBe(hashText('Hola mundo'));
	});

	test('differs when the content changes', () => {
		// The TTS cache id keys on this: streamed text must regenerate.
		expect(hashText('primer borrador')).not.toBe(hashText('primer borrador, editado'));
	});

	test('never produces an empty or negative key', () => {
		const key = hashText('');
		expect(key.length).toBeGreaterThan(0);
		expect(Number.isNaN(Number.parseInt(key, 36))).toBe(false);
		expect(hashText('a'.repeat(5000)).startsWith('-')).toBe(false);
	});
});

/** Minimal stand-in for an element in the DOM: `closest` already walked up. */
function fakeElement(id: string | null): Element {
	return {
		closest: () => ({ getAttribute: () => id })
	} as unknown as Element;
}

describe('resolveTargetIdFromElement', () => {
	test('reads the id from the closest registered block', () => {
		expect(resolveTargetIdFromElement(fakeElement('t3'))).toBe('t3');
	});

	test('returns null when no registered block is an ancestor', () => {
		expect(resolveTargetIdFromElement(fakeElement(null))).toBeNull();
	});

	test('treats an unregistered container (empty attribute) as no target', () => {
		expect(resolveTargetIdFromElement(fakeElement(''))).toBeNull();
	});
});
