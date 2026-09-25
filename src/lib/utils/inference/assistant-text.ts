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
