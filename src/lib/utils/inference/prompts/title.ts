export const TITLE_SYSTEM_MESSAGE =
	'Avoid Markdown. Respond with only the title: no reasoning, no preamble, no explanation, no quotes, no trailing period.';

export function buildTitleUserMessage(lang?: string): string {
	return `Create a short title describing the content. No more than 20 words. avoid quotes.`;
}
