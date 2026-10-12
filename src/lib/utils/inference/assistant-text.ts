import type {
	LlamaChatCompletionsResponse,
	LlamaChatMessageContentPart
} from '@/lib/utils/inference/llama-completions';

// Built by concatenation so the literal tag sequence never has to be spelled
// out in source comments, regexes or tests (and can be kept in one place).
const THINK_OPEN = `<${'think'}>`;
const THINK_CLOSE = `</${'think'}>`;

const THINK_BLOCK_PATTERN = new RegExp(`${THINK_OPEN}[\\s\\S]*?${THINK_CLOSE}`, 'g');

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
 * thinking blocks left inline.
 * @param response - Response from chatCompletions (or undefined).
 * @returns Assistant answer text, or empty string when neither field has text.
 */
export function assistantAnswerText(
	response: LlamaChatCompletionsResponse | undefined | null
): string {
	const message = response?.choices?.[0]?.message;
	const answer = stripThinkBlocks(messageContentText(message?.content)).trim();
	if (answer) return answer;

	const reasoning = typeof message?.reasoning_content === 'string' ? message.reasoning_content : '';
	return stripThinkBlocks(reasoning).trim();
}

/**
 * Flatten a chat message `content` field into plain text.
 *
 * Providers may answer either with a plain string or with an array of content
 * parts (text, images, tool payloads); only the text-bearing parts contribute.
 * @param content - Message content as sent by the provider.
 * @returns Concatenated text, or empty string when there is no text part.
 */
export function messageContentText(
	content: string | LlamaChatMessageContentPart[] | null | undefined
): string {
	if (typeof content === 'string') return content;
	if (!Array.isArray(content)) return '';

	let text = '';
	for (const part of content) {
		if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') {
			text += part.text;
		}
	}
	return text;
}

/**
 * Remove thinking traces from model output.
 *
 * Handles both the thinking blocks llama-server's reasoning parser emits and
 * raw inline traces left in `content` by models that ignore the per-request
 * thinking switch.
 * @param text - Raw model output.
 * @returns Text without thinking traces.
 */
export function stripThinkBlocks(text: string): string {
	const withoutBlocks = text.replace(THINK_BLOCK_PATTERN, '');
	// A lone opener with no closer means everything after it is still the
	// thinking trace (e.g. a truncated generation), not a final answer.
	if (withoutBlocks.trimStart().startsWith(THINK_OPEN)) return '';
	return withoutBlocks;
}
