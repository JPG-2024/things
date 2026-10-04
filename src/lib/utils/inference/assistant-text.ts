import type { LlamaChatCompletionsResponse } from '@/lib/utils/inference/llama-completions';

/**
 * Extract the assistant message text from a chat completions response.
 * @param response - Response from chatCompletions (or undefined).
 * @returns Assistant text content, or empty string when absent.
 */
export function assistantText(response: LlamaChatCompletionsResponse | undefined | null): string {
	const content = response?.choices?.[0]?.message?.content;
	return typeof content === 'string' ? content : '';
}

/**
 * Assistant answer text with a reasoner fallback.
 *
 * Reasoner models can put the whole answer inside `reasoning_content` (the
 * thinking trace) and close the turn without emitting final text — even when
 * reasoning was asked to run at low effort instead of being disabled. This
 * reads `content` first and falls back to the reasoning trace, stripping any
 * `<think>...</think>` blocks left inline.
 * @param response - Response from chatCompletions (or undefined).
 * @returns Assistant answer text, or empty string when neither field has text.
 */
export function assistantAnswerText(
	response: LlamaChatCompletionsResponse | undefined | null
): string {
	const message = response?.choices?.[0]?.message;
	const content = typeof message?.content === 'string' ? message.content : '';
	const answer = stripThinkBlocks(content).trim();
	if (answer) return answer;

	const reasoning = typeof message?.reasoning_content === 'string' ? message.reasoning_content : '';
	return stripThinkBlocks(reasoning).trim();
}

function stripThinkBlocks(text: string): string {
	const withoutBlocks = text.replace(/<think>[\s\S]*?<\/think>/g, '');
	// A lone opener with no closer means everything after it is still the
	// thinking trace (e.g. a truncated generation), not a final answer.
	if (withoutBlocks.trimStart().startsWith('<think>')) return '';
	return withoutBlocks;
}
