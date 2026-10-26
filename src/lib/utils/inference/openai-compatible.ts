import OpenAI from 'openai';
import type { ChatCompletion, ChatCompletionChunk } from 'openai/resources/chat/completions';
import {
	LlamaChatCompletionError,
	type LlamaChatCompletionOptions,
	type LlamaChatCompletionsChoice,
	type LlamaChatCompletionsRequest,
	type LlamaChatCompletionsResponse,
	type LlamaChatCompletionsUsage,
	type LlamaChatMessage
} from './llama-completions';

/**
 * Shared plumbing for every OpenAI-compatible remote provider (OpenRouter,
 * OpenCode Go, ...). It adapts the llama-completions request/response surface
 * onto the OpenAI SDK and accumulates streamed chunks back into a full
 * `LlamaChatCompletionsResponse`.
 */

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
	'enable_search',
	'think',
	'chat_template_kwargs'
]);

/**
 * Strip llama-server-only sampling/grammar fields before sending upstream.
 * @param request - The incoming chat completion request.
 * @returns A plain object without the llama-specific keys.
 */
export function stripLlamaFields(request: LlamaChatCompletionsRequest): Record<string, unknown> {
	const filtered: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(request)) {
		if (!LLAMA_SPECIFIC_FIELDS.has(key)) {
			filtered[key] = value;
		}
	}
	return filtered;
}

/**
 * Returns true when the request explicitly asks to disable thinking/reasoning.
 * @param request - The incoming chat completion request.
 * @returns Whether thinking should be disabled for this request.
 */
export function wantsThinkingDisabled(request: LlamaChatCompletionsRequest): boolean {
	if (request.reasoning_effort === 'none') return true;
	if (request.reasoning?.enabled === false) return true;
	if (request.reasoning?.effort === 'none') return true;
	return request.think === false || request.enable_thinking === false;
}

/**
 * Apply the unified OpenAI-compatible reasoning control (`reasoning.enabled`
 * / `reasoning.effort`) used by OpenRouter and OpenCode's inference API.
 * @param request - The request to translate.
 * @returns The request with the unified reasoning fields set.
 */
export function applyOpenAICompatibleThinking(
	request: LlamaChatCompletionsRequest
): LlamaChatCompletionsRequest {
	if (wantsThinkingDisabled(request)) {
		return {
			...request,
			reasoning: {
				...(request.reasoning ?? {}),
				enabled: false
			}
		};
	}

	// Map non-'none' effort levels onto the unified `reasoning` param; the raw
	// `reasoning_effort` field alone is OpenAI-specific.
	const effort = request.reasoning?.effort ?? request.reasoning_effort;
	if (effort && effort !== 'none' && request.reasoning?.effort === undefined) {
		return {
			...request,
			reasoning: {
				...(request.reasoning ?? {}),
				effort
			}
		};
	}
	return request;
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

function mapChoice(choice: ChatCompletion.Choice): LlamaChatCompletionsChoice {
	// Providers return the thinking trace in `reasoning_content`, which is not
	// part of the OpenAI SDK types; keep it so callers can recover reasoner-only
	// answers when `content` is empty.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const reasoningContent = (choice.message as any).reasoning_content;
	return {
		index: choice.index,
		message: {
			role: choice.message.role as LlamaChatMessage['role'],
			content: choice.message.content ?? null,
			...(typeof reasoningContent === 'string' && reasoningContent
				? { reasoning_content: reasoningContent }
				: {}),
			...(choice.message.tool_calls ? { tool_calls: mapToolCalls(choice.message.tool_calls) } : {})
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
		choices: chunk.choices.map((c) => {
			// Providers stream the thinking trace here (not in the OpenAI SDK
			// types); the streaming accumulator reads it back off the mapped
			// chunk to build `message.reasoning_content`.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const reasoningContent = (c.delta as any).reasoning_content as unknown;
			return {
				index: c.index,
				delta: {
					role: c.delta.role,
					content: c.delta.content ?? null,
					...(typeof reasoningContent === 'string' && reasoningContent
						? { reasoning_content: reasoningContent }
						: {}),
					...(c.delta.tool_calls ? { tool_calls: mapToolCalls(c.delta.tool_calls) } : {})
				},
				finish_reason: c.finish_reason,
				...(c.logprobs ? { logprobs: c.logprobs } : {})
			};
		}),
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

/**
 * Run a chat completion against an OpenAI-compatible endpoint, honoring the
 * llama-completions interface (streaming callbacks, abort signal, error type).
 *
 * @param getClient - Client factory; may be async when the key is read lazily.
 * @param model - Resolved model id to send in the request.
 * @param providerLabel - Human label used in error messages and ids.
 * @param request - The (already thinking-normalized) request.
 * @param options - Streaming callbacks and abort signal.
 * @returns A full response assembled from the stream when streaming.
 */
export async function openAICompatibleChatCompletions(
	getClient: () => OpenAI | Promise<OpenAI>,
	model: string,
	providerLabel: string,
	request: LlamaChatCompletionsRequest,
	options?: LlamaChatCompletionOptions
): Promise<LlamaChatCompletionsResponse> {
	const client = await getClient();

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
		const id = lastChunk?.id ?? `chatcmpl-${providerLabel.toLowerCase()}-${created}`;

		const choices = Array.from(accumulators.entries())
			.sort(([a], [b]) => a - b)
			.map(([index, acc]) => {
				const toolCalls =
					Object.keys(acc.toolCalls).length > 0
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
				: `Unknown ${providerLabel} error`;

		throw new LlamaChatCompletionError(
			`${providerLabel} /v1/chat/completions failed: ${detail}`,
			undefined,
			error
		);
	}
}
