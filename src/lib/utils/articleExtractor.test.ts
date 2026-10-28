import { afterEach, describe, expect, test } from 'bun:test';
import { extractArticle } from './articleExtractor';

const originalFetch = globalThis.fetch;

let lastRequest: { url: string; body: unknown } | null = null;

function mockFetch(handler: () => Response | Promise<Response>) {
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
		lastRequest = { url: String(input), body };
		return handler();
	}) as typeof fetch;
}

afterEach(() => {
	globalThis.fetch = originalFetch;
	lastRequest = null;
});

describe('extractArticle', () => {
	test('returns the trimmed title and the markdown body', async () => {
		mockFetch(() =>
			Response.json({
				url: 'https://example.com/post',
				title: '  Write Like You Talk  ',
				content: '# Intro\n\nBody.'
			})
		);

		const article = await extractArticle('https://example.com/post');

		expect(article).toEqual({ title: 'Write Like You Talk', content: '# Intro\n\nBody.' });
		expect(lastRequest?.url).toEndWith('/api/article');
		expect(lastRequest?.body).toEqual({
			url: 'https://example.com/post',
			format: 'md',
			render: 'auto',
			engine: 'defuddle'
		});
	});

	test('returns a null title when the page has none', async () => {
		mockFetch(() => Response.json({ title: '', content: 'Body.' }));

		expect((await extractArticle('https://example.com/post')).title).toBeNull();
	});

	test('surfaces the service error verbatim', async () => {
		mockFetch(() => Response.json({ error: 'Host "x" could not be resolved' }, { status: 502 }));

		await expect(extractArticle('https://example.com/post')).rejects.toThrow(
			'Host "x" could not be resolved'
		);
	});

	test('falls back to the HTTP status when the error body is not JSON', async () => {
		mockFetch(() => new Response('<html>Bad gateway</html>', { status: 500 }));

		await expect(extractArticle('https://example.com/post')).rejects.toThrow(
			'Web extractor failed (HTTP 500)'
		);
	});

	test('rejects a successful response without content', async () => {
		mockFetch(() => Response.json({ title: 'Empty' }));

		await expect(extractArticle('https://example.com/post')).rejects.toThrow(
			'Web extractor returned no content'
		);
	});
});
