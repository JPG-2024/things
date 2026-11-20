/**
 * Article extraction through the app's Rust backend.
 *
 * `extract_web_article` returns the article body as markdown plus its title.
 * The backend owns the fetch strategy (static first, headless-browser
 * fallback), the SSRF guard and the extraction engine, so this module only
 * calls the command and maps its result.
 */
import { invoke } from '@tauri-apps/api/core';

export interface ExtractedArticle {
	/** Page title, or `null` when the extractor could not find one. */
	title: string | null;
	/** Article body as markdown. */
	content: string;
}

export async function extractArticle(url: string): Promise<ExtractedArticle> {
	const result = await invoke<ExtractedArticle>('extract_web_article', { url });

	const content = typeof result?.content === 'string' ? result.content : '';
	if (!content.trim()) {
		throw new Error(`Web extractor returned no content for ${url}`);
	}

	const title = typeof result.title === 'string' ? result.title.trim() : '';

	return { title: title || null, content };
}
