import { afterAll, afterEach, describe, expect, mock, test } from 'bun:test';

let lastCall: { command: string; args?: Record<string, unknown> } | null = null;
let handler: () => unknown = () => ({});

mock.module('@tauri-apps/api/core', () => ({
	invoke: async (command: string, args?: Record<string, unknown>) => {
		lastCall = { command, args };
		return handler();
	}
}));

const { extractArticle } = await import('./articleExtractor');

afterEach(() => {
	lastCall = null;
	handler = () => ({});
});

afterAll(() => {
	mock.restore();
});

describe('extractArticle', () => {
	test('calls the extract command and returns the trimmed title and markdown body', async () => {
		handler = () => ({ title: '  Write Like You Talk  ', content: '# Intro\n\nBody.' });

		const article = await extractArticle('https://example.com/post');

		expect(article).toEqual({ title: 'Write Like You Talk', content: '# Intro\n\nBody.' });
		expect(lastCall).toEqual({
			command: 'extract_web_article',
			args: { url: 'https://example.com/post' }
		});
	});

	test('returns a null title when the page has none', async () => {
		handler = () => ({ title: null, content: 'Body.' });

		expect((await extractArticle('https://example.com/post')).title).toBeNull();
	});

	test('surfaces the backend error verbatim', async () => {
		handler = () => {
			throw 'Host "x" could not be resolved';
		};

		await expect(extractArticle('https://example.com/post')).rejects.toBe(
			'Host "x" could not be resolved'
		);
	});

	test('rejects a successful result without content', async () => {
		handler = () => ({ title: 'Empty' });

		await expect(extractArticle('https://example.com/post')).rejects.toThrow(
			'Web extractor returned no content'
		);
	});

	test('rejects a whitespace-only body', async () => {
		handler = () => ({ title: 'Empty', content: '   \n ' });

		await expect(extractArticle('https://example.com/post')).rejects.toThrow(
			'Web extractor returned no content'
		);
	});
});
