export const TITLE_SYSTEM_MESSAGE =
	'Avoid Markdown. Respond with only the title: no reasoning, no preamble, no explanation, no quotes, no trailing period.';

export function buildTitleUserMessage(): string {
	return `Create a short title describing the content. No more than 20 words. avoid quotes.`;
}

/**
 * User message for the per-window titles: same contract as the article title
 * (label only, no markdown) but sized for a card heading, not a document.
 */
export function buildWindowTitleUserMessage(): string {
	return 'create a short takeaway sentence (10 words maximum)';
}
