/**
 * Returns the system prompt for generating a topic summary.
 *
 * @returns The system prompt string.
 */
export function topicSummarySystemPrompt(): string {
	return `You are a research assistant preparing briefing notes for a podcast. Given the source content and a specific topic, write a concise factual summary of the source material that is relevant to the topic. Include key facts, figures, context, and viewpoints the hosts can reference. Keep it focused and under 400 words. Respond with plain text only, no headings or markdown.`;
}

/**
 * Returns the user prompt for generating a topic summary.
 *
 * @param topic - The topic to summarize.
 * @param content - The source content to summarize from.
 * @returns The user prompt string.
 */
export function topicSummaryUserPrompt(topic: string, content: string): string {
	return `Topic: ${topic}\n\nSource content:\n${content}`;
}
