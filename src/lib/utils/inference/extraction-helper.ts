import { stringArrayGbnf, stringArrayUpToGbnf } from '@/lib/utils/gbnf';
import { parseStructuredArrayResponses } from '@/lib/utils/helpers/tasks';
import { chatCompletions } from './chat-completions-provider';
import type { LlamaChatCompletionsRequest } from './llama-completions';
import { DEFAULT_STRUCTURED_OUTPUT_OPTIONS } from './constants';
import { buildExtractionSystemMessage, buildExtractionUserMessage } from './prompts';

export { buildExtractionSystemMessage, buildExtractionUserMessage };

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

/**
 * Small-LLM friendly extraction: "up to N" instead of "exactly N".
 *
 * - Instruction comes first, content is delimited in triple quotes.
 * - Grammar allows 1..maxCount items so short chunks don't force filler.
 * - `n_predict` scales with the requested count.
 * - On empty parse, retries once without grammar at slightly higher
 *   temperature before giving up (caller applies deterministic fallback).
 */
export async function extractionUpToHelper(
	content: string,
	maxCount: number,
	description: string,
	options?: { model?: string; minCount?: number }
): Promise<string[]> {
	const capped = Math.max(1, Math.trunc(maxCount));
	const minCount = Math.max(0, Math.min(options?.minCount ?? 1, capped));
	const systemMessage = `You are a data extraction assistant. Return only a JSON array with UP TO ${capped} ${description}. Fewer when the content is short. Never invent filler. No markdown, no explanations.`;
	const userMessage = `Extract up to ${capped} ${description}. Respond with a JSON array only.\n\nCONTENT:\n"""\n${content}\n"""`;
	const completionOptions = {
		...DEFAULT_STRUCTURED_OUTPUT_OPTIONS,
		model: options?.model ?? 'llama-server',
		grammar: stringArrayUpToGbnf(capped, minCount),
		n_predict: Math.min(1024, Math.max(256, capped * 64))
	};

	const first = await chatCompletions({
		...completionOptions,
		stream: false,
		messages: [
			{ role: 'system', content: systemMessage },
			{ role: 'user', content: userMessage }
		]
	} as LlamaChatCompletionsRequest);
	const firstText = first.choices?.[0]?.message?.content ?? '';
	const firstParsed = parseStructuredArrayResponses(typeof firstText === 'string' ? firstText : '');
	if (firstParsed.length > 0) return firstParsed.slice(0, capped);

	const retry = await chatCompletions({
		...completionOptions,
		grammar: undefined,
		temperature: 0.3,
		stream: false,
		messages: [
			{ role: 'system', content: systemMessage },
			{ role: 'user', content: userMessage }
		]
	} as LlamaChatCompletionsRequest);
	const retryText = retry.choices?.[0]?.message?.content ?? '';
	return parseStructuredArrayResponses(typeof retryText === 'string' ? retryText : '').slice(
		0,
		capped
	);
}
