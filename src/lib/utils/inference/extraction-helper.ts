import { stringArrayGbnf } from '@/lib/utils/gbnf';
import { parseStructuredArrayResponses } from '@/lib/utils/helpers/tasks';
import { chatCompletions } from './chat-completions-provider';
import type { LlamaChatCompletionsRequest } from './llama-completions';
import { DEFAULT_STRUCTURED_OUTPUT_OPTIONS } from './constants';

export function buildExtractionSystemMessage(count: number, description: string): string {
	return `You are a data extraction assistant. Return only a JSON array of exactly ${count} ${description}. No markdown, no explanations.`;
}

export function buildExtractionUserMessage(count: number, description: string): string {
	return `Extract ${count} ${description}. Respond in JSON format.`;
}

export function buildExtractionCompletionOptions(
	count: number,
	model?: string
): Record<string, unknown> {
	return {
		...DEFAULT_STRUCTURED_OUTPUT_OPTIONS,
		model: model ?? 'llama-server',
		grammar: stringArrayGbnf(count)
	};
}

export async function extractionHelper(
	content: string,
	count: number,
	description: string,
	options?: { model?: string }
): Promise<string[]> {
	const systemMessage = buildExtractionSystemMessage(count, description);
	const userMessage = buildExtractionUserMessage(count, description);
	const completionOptions = buildExtractionCompletionOptions(count, options?.model);

	const response = await chatCompletions({
		...completionOptions,
		stream: false,
		messages: [
			{ role: 'system', content: systemMessage },
			{ role: 'user', content: `context: ${content} ${userMessage}` }
		]
	} as LlamaChatCompletionsRequest);

	const text = response.choices?.[0]?.message?.content ?? '';
	const contentStr = typeof text === 'string' ? text : '';
	return parseStructuredArrayResponses(contentStr);
}
