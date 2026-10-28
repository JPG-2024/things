/**
 * Article extraction through the external scraper service.
 *
 * `POST /api/article` returns the article body as markdown plus its title.
 * The service owns the fetch strategy (static first, headless-browser
 * fallback) and the extraction engine, so this module only builds the request
 * and maps the response.
 */

const SCRAPER_API_URL = import.meta.env.VITE_SCRAPER_API_URL ?? 'http://localhost:3003';

/**
 * Safety net only: the service enforces its own caps (8 s static, 20 s
 * browser), so a request that reaches this limit means the server hung.
 */
const REQUEST_TIMEOUT_MS = 30_000;

export interface ExtractedArticle {
	/** Page title, or `null` when the service could not find one. */
	title: string | null;
	/** Article body as markdown. */
	content: string;
}

interface ArticleResponse {
	title?: string | null;
	content?: string;
	error?: string;
}

/**
 * Extracts the body and title of a web page.
 *
 * Errors from the service (`{ error }` with 400/408/502/504/500) are surfaced
 * verbatim; a non-JSON body falls back to a generic HTTP message.
 */
export async function extractArticle(url: string): Promise<ExtractedArticle> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

	try {
		const response = await fetch(`${SCRAPER_API_URL}/api/article`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ url, format: 'md', render: 'auto', engine: 'defuddle' }),
			signal: controller.signal
		});

		const payload = (await readJson(response)) ?? {};

		console.log(payload);

		if (!response.ok) {
			throw new Error(payload.error ?? `Web extractor failed (HTTP ${response.status})`);
		}

		const content = typeof payload.content === 'string' ? payload.content : '';
		if (!content.trim()) {
			throw new Error(`Web extractor returned no content for ${url}`);
		}

		const title = typeof payload.title === 'string' ? payload.title.trim() : '';

		return { title: title || null, content };
	} catch (error) {
		if (isAbortError(error)) {
			throw new Error(`Web extractor timed out after ${REQUEST_TIMEOUT_MS}ms: ${url}`, {
				cause: error
			});
		}
		throw error;
	} finally {
		clearTimeout(timeout);
	}
}

async function readJson(response: Response): Promise<ArticleResponse | null> {
	try {
		return (await response.json()) as ArticleResponse;
	} catch {
		return null;
	}
}

function isAbortError(error: unknown): boolean {
	return error instanceof DOMException && error.name === 'AbortError';
}
