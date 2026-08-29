import { chatCompletions } from '@/lib/utils/inference/chat-completions-provider';
import { viewState } from '@/stores/viewStore.svelte';
import type { ArticleWithTasks } from '@/stores/webStore';

const MAX_ITEMS = 25;
const MAX_CHARS_PER_ITEM = 300;
const MAX_TOTAL_CHARS = 15000;

function extractTitle(article: ArticleWithTasks): string | null {
	const title = article.persistedTasks?.find((t) => t.name?.toLowerCase() === 'title')?.data;
	return typeof title === 'string' && title.trim() ? title.trim() : null;
}

function extractSummary(article: ArticleWithTasks): string | null {
	const summary = article.persistedTasks?.find(
		(t) => t.id === 'title-summary' || t.id === 'summary'
	)?.data;
	return typeof summary === 'string' && summary.trim() ? summary.trim() : null;
}

export function collectArticleTexts(articles: ArticleWithTasks[]): string[] {
	const items: string[] = [];
	for (const article of articles) {
		if (items.length >= MAX_ITEMS) break;
		const title = extractTitle(article);
		const summary = extractSummary(article);
		if (!title && !summary) continue;
		const titlePart = title ? `Title: ${title}` : '';
		const summaryPart = summary ? `Summary: ${summary.slice(0, MAX_CHARS_PER_ITEM)}` : '';
		items.push([titlePart, summaryPart].filter(Boolean).join(' | '));
	}
	return items;
}

export async function generateProfileSummary(articles: ArticleWithTasks[]): Promise<string> {
	const items = collectArticleTexts(articles);
	if (items.length === 0) {
		throw new Error('No titles or summaries available for the fetched articles');
	}

	let text = items.join('\n');
	if (text.length > MAX_TOTAL_CHARS) {
		text = text.slice(0, MAX_TOTAL_CHARS);
	}

	const response = await chatCompletions({
		model: viewState.aiModel || undefined,
		temperature: 0.4,
		stream: false,
		messages: [
			{
				role: 'system',
				content:
					'You are an assistant that writes short profile descriptions. Write a concise description of 2-3 sentences summarizing the topics these articles cover. No markdown, no title, no bullet lists.'
			},
			{
				role: 'user',
				content: `Articles fetched for this profile:\n\n${text}\n\nWrite a short description of what this profile covers.`
			}
		]
	});

	const content = response.choices?.[0]?.message?.content;
	if (typeof content !== 'string' || !content.trim()) {
		throw new Error('Empty summary generated');
	}
	return content.trim();
}