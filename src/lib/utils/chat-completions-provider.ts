import OpenAI from 'openai';
import type { ChatCompletion, ChatCompletionChunk } from 'openai/resources/chat/completions';
import {
	chatCompletions as llamaChatCompletions,
	LlamaChatCompletionError,
	type LlamaChatCompletionOptions,
	type LlamaChatCompletionsChoice,
	type LlamaChatCompletionsRequest,
	type LlamaChatCompletionsResponse,
	type LlamaChatCompletionsUsage,
	type LlamaChatMessage
} from '@/lib/utils/llama-completions';
import { viewState } from '@/stores/viewStore.svelte';

export type {
	LlamaChatCompletionsRequest,
	LlamaChatCompletionsResponse,
	LlamaChatCompletionsChoice,
	LlamaChatCompletionsUsage,
	LlamaChatMessage,
	LlamaChatCompletionOptions
} from '@/lib/utils/llama-completions';

export { LlamaChatCompletionError } from '@/lib/utils/llama-completions';

export const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-4o';

const LLAMA_SPECIFIC_FIELDS = new Set([
	'grammar',
	'mirostat',
	'mirostat_tau',
	'mirostat_eta',
	'repeat_penalty',
	'repeat_last_n',
	'cache_prompt',
	'n_keep',
	'n_predict',
	'timings_per_token',
	'return_tokens',
	'return_progress',
	'response_fields',
	'json_schema',
	'top_k',
	'min_p',
	'typical_p',
	'enable_thinking',
	'enable_search'
]);

let openrouterClient: OpenAI | null = null;

function getOpenRouterClient(): OpenAI {
	if (openrouterClient) return openrouterClient;

	const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY;
	if (!apiKey) {
		throw new LlamaChatCompletionError(
			'OpenRouter API key is not set. Add VITE_OPENROUTER_API_KEY to your .env file.',
			undefined,
			undefined
		);
	}

	const siteUrl = import.meta.env.VITE_OPENROUTER_SITE_URL;
	const siteName = import.meta.env.VITE_OPENROUTER_SITE_NAME;

	openrouterClient = new OpenAI({
		baseURL: 'https://openrouter.ai/api/v1',
		apiKey,
		dangerouslyAllowBrowser: true,
		defaultHeaders: {
			...(siteUrl ? { 'HTTP-Referer': siteUrl } : {}),
			...(siteName ? { 'X-OpenRouter-Title': siteName } : {})
		}
	});

	return openrouterClient;
}

function stripLlamaFields(
	request: LlamaChatCompletionsRequest
): Record<string, unknown> {
	const filtered: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(request)) {
		if (!LLAMA_SPECIFIC_FIELDS.has(key)) {
			filtered[key] = value;
		}
	}
	return filtered;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapToolCalls(toolCalls: any[] | undefined): LlamaChatMessage['tool_calls'] {
	if (!toolCalls?.length) return undefined;
	return toolCalls.map((tc) => ({
		id: tc.id ?? null,
		type: 'function' as const,
		index: tc.index ?? 0,
		function: {
			name: tc.function?.name ?? '',
			arguments: tc.function?.arguments ?? ''
		}
	}));
}

function mapChoice(
	choice: ChatCompletion.Choice
): LlamaChatCompletionsChoice {
	return {
		index: choice.index,
		message: {
			role: choice.message.role as LlamaChatMessage['role'],
			content: choice.message.content ?? null,
			...(choice.message.tool_calls
				? { tool_calls: mapToolCalls(choice.message.tool_calls) }
				: {})
		},
		finish_reason: choice.finish_reason as LlamaChatCompletionsChoice['finish_reason'],
		...(choice.logprobs ? { logprobs: choice.logprobs } : {})
	};
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapUsage(usage: any): LlamaChatCompletionsUsage {
	return {
		prompt_tokens: usage.prompt_tokens,
		completion_tokens: usage.completion_tokens,
		total_tokens: usage.total_tokens
	};
}

function mapResponse(completion: ChatCompletion): LlamaChatCompletionsResponse {
	return {
		id: completion.id,
		object: 'chat.completion',
		created: completion.created,
		model: completion.model,
		choices: completion.choices.map(mapChoice),
		...(completion.usage ? { usage: mapUsage(completion.usage) } : {})
	};
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapChunk(chunk: ChatCompletionChunk): any {
	return {
		id: chunk.id,
		object: 'chat.completion.chunk' as const,
		created: chunk.created,
		model: chunk.model,
		choices: chunk.choices.map((c) => ({
			index: c.index,
			delta: {
				role: c.delta.role,
				content: c.delta.content ?? null,
				...(c.delta.tool_calls
					? { tool_calls: mapToolCalls(c.delta.tool_calls) }
					: {})
			},
			finish_reason: c.finish_reason,
			...(c.logprobs ? { logprobs: c.logprobs } : {})
		})),
		...(chunk.usage
			? {
					usage: {
						prompt_tokens: chunk.usage.prompt_tokens,
						completion_tokens: chunk.usage.completion_tokens,
						total_tokens: chunk.usage.total_tokens
					}
				}
			: {})
	};
}

async function openrouterChatCompletions(
	request: LlamaChatCompletionsRequest,
	options?: LlamaChatCompletionOptions
): Promise<LlamaChatCompletionsResponse> {
	const client = getOpenRouterClient();
	const model = viewState.openrouterModel || DEFAULT_OPENROUTER_MODEL;

	const streamEnabled =
		request.stream === true ||
		typeof options?.onToken === 'function' ||
		typeof options?.onReasoningToken === 'function';

	const params = {
		...stripLlamaFields(request),
		model,
		stream: streamEnabled
	};

	try {
		if (!streamEnabled) {
			const completion = await client.chat.completions.create(
				params as OpenAI.ChatCompletionCreateParamsNonStreaming,
				{ signal: options?.signal }
			);
			return mapResponse(completion);
		}

		const stream = await client.chat.completions.create(
			params as OpenAI.ChatCompletionCreateParamsStreaming,
			{ signal: options?.signal }
		);

		const accumulators = new Map<
			number,
			{
				role?: string;
				content: string;
				reasoningContent: string;
				finish_reason: LlamaChatCompletionsChoice['finish_reason'];
				toolCalls: Record<
					number,
					{
						id?: string | null;
						type?: string;
						index?: number;
						function: { name: string; arguments: string };
					}
				>;
				logprobs?: unknown;
			}
		>();

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let lastChunk: any = null;
		let usage: LlamaChatCompletionsUsage | undefined;

		for await (const rawChunk of stream) {
			if (options?.signal?.aborted) break;

			const chunk = mapChunk(rawChunk);
			lastChunk = chunk;
			if (chunk.usage) usage = chunk.usage as LlamaChatCompletionsUsage;

			options?.onChunk?.(chunk);

			for (const choice of chunk.choices ?? []) {
				const index = choice.index ?? 0;
				const delta = choice.delta ?? {};

				const current = accumulators.get(index) ?? {
					role: undefined,
					content: '',
					reasoningContent: '',
					finish_reason: null,
					toolCalls: {},
					logprobs: undefined
				};

				if (delta.role) current.role = delta.role;

				const reasoningToken =
					typeof delta.reasoning_content === 'string' ? delta.reasoning_content : '';
				if (reasoningToken) {
					current.reasoningContent += reasoningToken;
					options?.onReasoningToken?.(reasoningToken, chunk);
				}

				const token = typeof delta.content === 'string' ? delta.content : '';
				if (token) {
					current.content += token;
					options?.onToken?.(token, chunk);
				}

				if (delta.tool_calls?.length) {
					for (const deltaTc of delta.tool_calls) {
						const tcIndex = deltaTc.index ?? 0;
						const prev = current.toolCalls[tcIndex] ?? {
							id: deltaTc.id ?? null,
							type: deltaTc.type ?? 'function',
							index: tcIndex,
							function: { name: '', arguments: '' }
						};

						current.toolCalls[tcIndex] = {
							id: deltaTc.id ?? prev.id,
							type: deltaTc.type ?? prev.type,
							index: tcIndex,
							function: {
								name: deltaTc.function?.name ?? prev.function?.name ?? '',
								arguments: `${prev.function?.arguments ?? ''}${deltaTc.function?.arguments ?? ''}`
							}
						};
					}
				}

				if (choice.finish_reason !== null && choice.finish_reason !== undefined) {
					current.finish_reason = choice.finish_reason;
				}

				if (choice.logprobs !== undefined) current.logprobs = choice.logprobs;

				accumulators.set(index, current);
			}
		}

		const created = lastChunk?.created ?? Math.floor(Date.now() / 1000);
		const modelStr = lastChunk?.model ?? request.model;
		const id = lastChunk?.id ?? `chatcmpl-openrouter-${created}`;

		const choices = Array.from(accumulators.entries())
			.sort(([a], [b]) => a - b)
			.map(([index, acc]) => {
				const toolCalls = Object.keys(acc.toolCalls).length > 0
					? Object.keys(acc.toolCalls)
							.map((i) => Number(i))
							.sort((a, b) => a - b)
							.map((i) => acc.toolCalls[i])
					: undefined;

				return {
					index,
					message: {
						role: (acc.role ?? 'assistant') as LlamaChatMessage['role'],
						content: acc.content || null,
						...(acc.reasoningContent ? { reasoning_content: acc.reasoningContent } : {}),
						...(toolCalls ? { tool_calls: toolCalls } : {})
					},
					finish_reason: acc.finish_reason,
					...(acc.logprobs !== undefined ? { logprobs: acc.logprobs } : {})
				};
			}) as LlamaChatCompletionsChoice[];

		return {
			id,
			object: 'chat.completion',
			created,
			model: modelStr,
			choices,
			...(usage ? { usage } : {})
		};
	} catch (error) {
		if (error instanceof DOMException && error.name === 'AbortError') {
			throw error;
		}
		if (error instanceof LlamaChatCompletionError) {
			throw error;
		}

		const detail =
			error instanceof Error && error.message.trim()
				? error.message.trim()
				: 'Unknown OpenRouter error';

		throw new LlamaChatCompletionError(
			`OpenRouter /v1/chat/completions failed: ${detail}`,
			undefined,
			error
		);
	}
}

export async function chatCompletions(
	request: LlamaChatCompletionsRequest,
	options?: LlamaChatCompletionOptions
): Promise<LlamaChatCompletionsResponse> {
	if (viewState.aiProvider === 'openrouter') {
		return openrouterChatCompletions(request, options);
	}
	return llamaChatCompletions(request, options);
}
