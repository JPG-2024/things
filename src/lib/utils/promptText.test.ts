import { describe, expect, test } from 'bun:test';
import { mergePrompts, PROMPT_DEFAULTS, resolvePrompt, serializePrompts } from './promptText';

describe('resolvePrompt', () => {
	test('returns the configured value when it has content', () => {
		expect(resolvePrompt('windowUser', '  Be terse. ')).toBe('Be terse.');
	});

	test('falls back to the default on an empty or whitespace-only value', () => {
		expect(resolvePrompt('windowUser', '')).toBe(PROMPT_DEFAULTS.windowUser);
		expect(resolvePrompt('windowUser', '   \n\t ')).toBe(PROMPT_DEFAULTS.windowUser);
		expect(resolvePrompt('windowUser', undefined)).toBe(PROMPT_DEFAULTS.windowUser);
	});

	test('resolves every key against its own default', () => {
		for (const key of Object.keys(PROMPT_DEFAULTS) as (keyof typeof PROMPT_DEFAULTS)[]) {
			expect(resolvePrompt(key, '')).toBe(PROMPT_DEFAULTS[key]);
		}
	});
});

describe('mergePrompts', () => {
	test('keeps known keys and drops unknown ones', () => {
		const merged = mergePrompts({ windowUser: 'Custom.', nope: 'ignored' });

		expect(merged.windowUser).toBe('Custom.');
		expect('nope' in merged).toBe(false);
	});

	test('ignores non-string values instead of leaking them into a prompt', () => {
		const merged = mergePrompts({ windowSystem: 42, finalUser: null, windowUser: 'ok' });

		expect(merged.windowSystem).toBe(PROMPT_DEFAULTS.windowSystem);
		expect(merged.finalUser).toBe(PROMPT_DEFAULTS.finalUser);
		expect(merged.windowUser).toBe('ok');
	});

	test('returns the full default shape for a non-object section', () => {
		expect(mergePrompts(null)).toEqual(PROMPT_DEFAULTS);
		expect(mergePrompts('nope')).toEqual(PROMPT_DEFAULTS);
		expect(mergePrompts([1, 2])).toEqual(PROMPT_DEFAULTS);
		expect(mergePrompts(undefined)).toEqual(PROMPT_DEFAULTS);
	});

	test('round-trips through serializePrompts', () => {
		const values = { ...PROMPT_DEFAULTS, finalUser: 'Merge it.' };
		expect(mergePrompts(serializePrompts(values))).toEqual(values);
	});
});
