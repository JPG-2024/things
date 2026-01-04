/**
 * OpenAI Chat API Integration
 * Uses OpenAI SDK to connect to llama-server's OpenAI-compatible API v1
 * Maintains all existing interfaces for backward compatibility
 */

import OpenAI from 'openai';
import type { ChatCompletionMessageParam, ChatCompletionCreateParamsStreaming, ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions';

// ============================================================================
// Environment Configuration
// ============================================================================

// Environment variables can be set at build time via import.meta.env
const DEFAULT_BASE_URL = typeof import.meta !== 'undefined' && import.meta.env?.OPENAI_BASE_URL 
  ? import.meta.env.OPENAI_BASE_URL 
  : 'http://localhost:8080/v1';
const DEFAULT_API_KEY = typeof import.meta !== 'undefined' && import.meta.env?.OPENAI_API_KEY 
  ? import.meta.env.OPENAI_API_KEY 
  : 'not-needed'; // llama-server doesn't require API key

// ============================================================================
// Error Handling
// ============================================================================

/**
 * Custom error class for chat API errors
 */
export class ChatAPIError extends Error {
	constructor(
		message: string,
		public statusCode?: number,
		public originalError?: unknown
	) {
		super(message);
		this.name = 'ChatAPIError';
	}
}

// ============================================================================
// Types
// ============================================================================

/**
 * Message role in the conversation
 */
export type MessageRole = 'user' | 'assistant' | 'system';

/**
 * Tool definition for function calling
 */
export interface Tool {
	/** Tool type (currently only 'function' is supported) */
	type: 'function';
	/** Function definition */
	function: {
		/** Function name */
		name: string;
		/** Function description */
		description?: string;
		/** Function parameters in JSON Schema format */
		parameters?: Record<string, unknown>;
	};
}

/**
 * Tool result from function calling
 */
export interface ToolResult {
	/** Role identifier for tool results */
	role: 'tool';
	/** Tool call ID this result is for */
	tool_call_id?: string;
	/** Content of the tool result */
	content: string;
}

/**
 * Tool call made by the assistant
 */
export interface ToolCall {
	/** ID of the tool call */
	id: string;
	/** Name of the function to call */
	function: string;
	/** Arguments to pass to the function (JSON string) */
	arguments?: string;
}

/**
 * Message in a chat conversation
 */
export interface ChatMessage {
	/** Role of the message sender */
	role: MessageRole | 'tool';
	/** Message content text */
	content: string | null;
	/** Tool calls made by the assistant */
	tool_calls?: ToolCall[];
	/** Tool call ID (for tool messages) */
	tool_call_id?: string;
	/** Base64-encoded images for multimodal models */
	images?: string[];
}

/**
 * Model-specific options for chat generation
 */
export interface ChatOptions {
	/** Number of tokens to predict (-1 for infinite, -2 for fill context) */
	num_predict?: number;
	max_tokens?: number;
	/** Top-k sampling parameter */
	top_k?: number;
	/** Top-p sampling parameter */
	top_p?: number;
	/** Minimum probability for top-p sampling */
	min_p?: number;
	/** Temperature for randomness (higher = more random) */
	temperature?: number;
	/** Repetition penalty */
	repeat_penalty?: number;
	/** Presence penalty */
	presence_penalty?: number;
	/** Frequency penalty */
	frequency_penalty?: number;
	/** Enable Mirostat sampling (0 = disabled, 1 = Mirostat, 2 = Mirostat 2.0) */
	mirostat?: number;
	/** Mirostat learning rate */
	mirostat_eta?: number;
	/** Mirostat target entropy */
	mirostat_tau?: number;
	/** Number of tokens to consider for penalizing repetition */
	repeat_last_n?: number;
	/** Random seed for reproducibility */
	seed?: number;
	/** Stop sequences */
	stop?: string[];
	/** Tail-free sampling parameter */
	tfs_z?: number;
	/** Context window size */
	num_ctx?: number;
	/** Number of threads to use */
	num_thread?: number;
}

/**
 * Log probabilities for a token
 */
export interface LogProb {
	token: string;
	logprob: number;
}

/**
 * Token with its top log probabilities
 */
export interface TokenLogProbs {
	token: string;
	logprob: number;
	top_logprobs?: LogProb[];
}

/**
 * Request body for the chat API
 */
export interface ChatRequest {
	/** Model name (required) */
	model: string;
	/** Messages in the conversation (required) */
	messages: ChatMessage[];
	/** Tools available to the model */
	tools?: Tool[];
	/** Response format ('json' for JSON mode) */
	format?: string | { type: 'json' };
	response_format?: { type: 'json_object' };
	/** Enable streaming responses (default: true) */
	stream?: boolean;
	/** Enable extended thinking/reasoning mode */
	think?: boolean;
	/** Time to keep model loaded (e.g., "5m", "10s") */
	keep_alive?: string | number;
	/** Model-specific options */
	options?: ChatOptions;
	/** Return log probabilities with response */
	logprobs?: boolean;
	/** Number of top log probabilities to return per token */
	top_logprobs?: number;
	max_tokens?: number;
	presence_penalty?: number;
	frequency_penalty?: number;
	seed?: number;
	stop?: string[];
	temperature?: number;
	top_p?: number;
}

/**
 * Response from the chat API (non-streaming)
 */
export interface ChatResponse {
	id: string;
	object: string;
	/** Model name used */
	model: string;
	/** Timestamp of creation */
	created: number;
	/** Message from the assistant */
	message: ChatMessage;
	choices: {
		index: number;
		message: ChatMessage;
		finish_reason: string;
		logprobs: { content: TokenLogProbs[] | null } | null;
	}[];
	/** Extended thinking/reasoning (if think mode enabled) */
	thinking?: string;
	/** Whether generation is complete */
	done: boolean;
	/** Reason for completion (e.g., "stop", "length", "tool_calls") */
	done_reason?: string;
	usage?: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	};
	/** Total generation time in nanoseconds */
	total_duration?: number;
	/** Model load time in nanoseconds */
	load_duration?: number;
	/** Number of tokens in the prompt */
	prompt_eval_count?: number;
	/** Time to evaluate prompt in nanoseconds */
	prompt_eval_duration?: number;
	/** Number of tokens generated */
	eval_count?: number;
	/** Time to generate response in nanoseconds */
	eval_duration?: number;
	/** Log probabilities for generated tokens */
	logprobs?: TokenLogProbs[];
}

/**
 * Streaming chunk from the chat API
 */
export interface ChatStreamChunk {
	id: string;
	object: string;
	created: number;
	model: string;
	choices: {
		index: number;
		delta: Partial<ChatMessage>;
		finish_reason: string | null;
		logprobs?: { content: TokenLogProbs[] | null } | null;
	}[];
	/** Whether this is the final chunk */
	done: boolean;
	// Fields from old ChatResponse that might appear in a stream
	message: ChatMessage;
	done_reason?: string;
	total_duration?: number;
	load_duration?: number;
	prompt_eval_count?: number;
	prompt_eval_duration?: number;
	eval_count?: number;
	eval_duration?: number;
	thinking?: string;
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Create an OpenAI client instance
 * @param baseUrl - Base URL for the API (default from env or http://localhost:8080/v1)
 * @returns OpenAI client instance
 */
function createClient(baseUrl?: string): OpenAI {
	return new OpenAI({
		baseURL: baseUrl || DEFAULT_BASE_URL,
		apiKey: DEFAULT_API_KEY,
		dangerouslyAllowBrowser: true // Required for browser usage
	});
}

/**
 * Adapt ChatRequest options to OpenAI parameters
 */
function adaptRequestOptions(request: ChatRequest): ChatCompletionCreateParamsNonStreaming | ChatCompletionCreateParamsStreaming {
	const params: any = {
		model: request.model,
		messages: request.messages as ChatCompletionMessageParam[],
	};

	// Map options
	if (request.options?.temperature !== undefined) params.temperature = request.options.temperature;
	if (request.options?.top_p !== undefined) params.top_p = request.options.top_p;
	if (request.options?.max_tokens !== undefined) params.max_tokens = request.options.max_tokens;
	if (request.options?.num_predict !== undefined) params.max_tokens = request.options.num_predict;
	if (request.options?.presence_penalty !== undefined) params.presence_penalty = request.options.presence_penalty;
	if (request.options?.frequency_penalty !== undefined) params.frequency_penalty = request.options.frequency_penalty;
	if (request.options?.stop !== undefined) params.stop = request.options.stop;
	if (request.options?.seed !== undefined) params.seed = request.options.seed;

	// Direct parameters override options
	if (request.temperature !== undefined) params.temperature = request.temperature;
	if (request.top_p !== undefined) params.top_p = request.top_p;
	if (request.max_tokens !== undefined) params.max_tokens = request.max_tokens;
	if (request.presence_penalty !== undefined) params.presence_penalty = request.presence_penalty;
	if (request.frequency_penalty !== undefined) params.frequency_penalty = request.frequency_penalty;
	if (request.stop !== undefined) params.stop = request.stop;
	if (request.seed !== undefined) params.seed = request.seed;

	// Tools
	if (request.tools && request.tools.length > 0) {
		params.tools = request.tools;
	}

	// Response format
	if (request.format === 'json' || request.response_format?.type === 'json_object') {
		params.response_format = { type: 'json_object' };
	}

	// Logprobs
	if (request.logprobs !== undefined) params.logprobs = request.logprobs;
	if (request.top_logprobs !== undefined) params.top_logprobs = request.top_logprobs;

	return params;
}

/**
 * Batch chat inference (non-streaming)
 * 
 * @param request - The chat request configuration
 * @param baseUrl - Base URL for API (optional, uses env var or default)
 * @returns Promise resolving to the complete chat response
 * 
 * @example
 * ```typescript
 * const response = await createBatchChat({
 *   model: 'ministral-3:3b',
 *   messages: [
 *     { role: 'user', content: 'What is the capital of France?' }
 *   ]
 * });
 * console.log(response.choices[0].message.content);
 * ```
 */
export async function createBatchChat(
	request: ChatRequest,
	baseUrl?: string
): Promise<ChatResponse> {
	const client = createClient(baseUrl);
	
	try {
		const params = adaptRequestOptions(request) as ChatCompletionCreateParamsNonStreaming;
		params.stream = false;

		const response = await client.chat.completions.create(params);

		// Adapt to ChatResponse format with backward compatibility fields
		const choice = response.choices[0];
		const adaptedResponse: ChatResponse = {
			id: response.id,
			object: response.object,
			model: response.model,
			created: response.created,
			choices: response.choices.map(c => ({
				index: c.index,
				message: c.message as ChatMessage,
				finish_reason: c.finish_reason || 'stop',
				logprobs: c.logprobs
			})),
			usage: response.usage,
			// Backward compatibility fields
			message: choice.message as ChatMessage,
			done: true,
			done_reason: choice.finish_reason || 'stop',
			prompt_eval_count: response.usage?.prompt_tokens,
			eval_count: response.usage?.completion_tokens
		};

		return adaptedResponse;
	} catch (error) {
		if (error instanceof OpenAI.APIError) {
			throw new ChatAPIError(
				`API error: ${error.message}`,
				error.status,
				error
			);
		}
		throw new ChatAPIError(
			`Failed to create batch chat: ${error instanceof Error ? error.message : String(error)}`,
			undefined,
			error
		);
	}
}

/**
 * Streaming chat inference
 * 
 * @param request - The chat request configuration
 * @param baseUrl - Base URL for API (optional, uses env var or default)
 * @returns AsyncGenerator yielding response chunks as they arrive
 * 
 * @example
 * ```typescript
 * for await (const chunk of createStreamingChat({
 *   model: 'ministral-3:3b',
 *   messages: [
 *     { role: 'user', content: 'Tell me about TypeScript' }
 *   ]
 * })) {
 *   process.stdout.write(chunk.choices[0]?.delta?.content || '');
 *   if (chunk.done) {
 *     console.log('\nComplete!');
 *   }
 * }
 * ```
 */
export async function* createStreamingChat(
	request: ChatRequest,
	baseUrl?: string
): AsyncGenerator<ChatStreamChunk, void, unknown> {
	const client = createClient(baseUrl);
	
	try {
		const params = adaptRequestOptions(request) as ChatCompletionCreateParamsStreaming;
		params.stream = true;
		params.stream_options = { include_usage: true };

		const stream = await client.chat.completions.create(params);

		for await (const chunk of stream) {
			const choice = chunk.choices[0];
			const delta = choice?.delta || {};
			const finish_reason = choice?.finish_reason;

			// Convert OpenAI tool calls to our format
			const convertedToolCalls = delta.tool_calls?.map(tc => ({
				id: tc.id || '',
				function: typeof tc.function === 'object' ? tc.function.name || '' : tc.function || '',
				arguments: typeof tc.function === 'object' ? tc.function.arguments : undefined
			}));

			const adaptedChunk: ChatStreamChunk = {
				id: chunk.id,
				object: chunk.object,
				created: chunk.created,
				model: chunk.model,
				choices: chunk.choices.map(c => ({
					index: c.index,
					delta: c.delta as Partial<ChatMessage>,
					finish_reason: c.finish_reason,
					logprobs: c.logprobs
				})),
				done: !!finish_reason,
				// Backward compatibility fields
				message: {
					role: (delta.role as MessageRole) || 'assistant',
					content: delta.content || '',
					tool_calls: convertedToolCalls
				},
				done_reason: finish_reason || undefined
			};

			// Add usage stats if available (typically in the final chunk)
			if (chunk.usage) {
				adaptedChunk.prompt_eval_count = chunk.usage.prompt_tokens;
				adaptedChunk.eval_count = chunk.usage.completion_tokens;
			}

			yield adaptedChunk;
		}
	} catch (error) {
		if (error instanceof OpenAI.APIError) {
			throw new ChatAPIError(
				`API error: ${error.message}`,
				error.status,
				error
			);
		}
		throw new ChatAPIError(
			`Failed to create streaming chat: ${error instanceof Error ? error.message : String(error)}`,
			undefined,
			error
		);
	}
}

/**
 * Send a chat message to API (non-streaming) - Legacy alias
 * @deprecated Use createBatchChat instead
 */
export async function chat(
	request: ChatRequest,
	baseUrl?: string
): Promise<ChatResponse> {
	return createBatchChat(request, baseUrl);
}

/**
 * Send a chat message with streaming responses - Legacy alias
 * @deprecated Use createStreamingChat instead
 */
export async function* chatStream(
	request: ChatRequest,
	baseUrl?: string
): AsyncGenerator<ChatStreamChunk, void, unknown> {
	yield* createStreamingChat(request, baseUrl);
}

/**
 * Helper function to collect all chunks from a streaming chat into a single response
 * 
 * @param request - The chat request configuration
 * @param baseUrl - Base URL for API (optional, uses env var or default)
 * @returns Promise resolving to the complete response with all chunks combined
 * 
 * @example
 * ```typescript
 * const response = await chatStreamComplete({
 *   model: 'ministral-3:3b',
 *   messages: [
 *     { role: 'user', content: 'Write a haiku about TypeScript' }
 *   ]
 * });
 * console.log(response.message.content); // Complete haiku
 * console.log(response.eval_count); // Total tokens generated
 * ```
 */
export async function chatStreamComplete(
	request: ChatRequest,
	baseUrl?: string
): Promise<ChatResponse> {
	let fullContent = '';
	let toolCalls: ToolCall[] = [];
	let lastChunk: ChatStreamChunk | null = null;
	let finalRole: MessageRole = 'assistant';

	for await (const chunk of createStreamingChat(request, baseUrl)) {
		if (chunk.choices[0]?.delta?.content) {
			fullContent += chunk.choices[0].delta.content;
		}
		if (chunk.choices[0]?.delta?.tool_calls) {
			// Piece together tool calls that are streamed incrementally
			for (const deltaToolCall of chunk.choices[0].delta.tool_calls as any[]) {
				if (!deltaToolCall.id) continue;
				
				const existing = toolCalls.find((tc) => tc.id === deltaToolCall.id);
				
				if (existing) {
					// Append arguments if they exist
					if (deltaToolCall.function?.arguments) {
						existing.arguments =
							(existing.arguments || '') + deltaToolCall.function.arguments;
					}
				} else if (deltaToolCall.function?.name) {
					// Create new tool call entry
					toolCalls.push({
						id: deltaToolCall.id,
						function: deltaToolCall.function.name,
						arguments: deltaToolCall.function.arguments
					});
				}
			}
		}
		if (chunk.choices[0]?.delta?.role) {
			finalRole = chunk.choices[0].delta.role as MessageRole;
		}
		lastChunk = chunk;
	}

	if (!lastChunk) {
		throw new ChatAPIError('No chunks received from streaming chat response');
	}

	// Reconstruct the final response from the last chunk and accumulated data
	const finalResponse: ChatResponse = {
		id: lastChunk.id,
		object: lastChunk.object,
		created: lastChunk.created,
		model: lastChunk.model,
		choices: [
			{
				index: 0,
				message: {
					role: finalRole,
					content: fullContent,
					tool_calls: toolCalls.length > 0 ? toolCalls : undefined
				},
				finish_reason: lastChunk.choices[0]?.finish_reason || 'stop',
				logprobs: null
			}
		],
		usage: {
			prompt_tokens: lastChunk.prompt_eval_count || 0,
			completion_tokens: lastChunk.eval_count || 0,
			total_tokens: (lastChunk.prompt_eval_count || 0) + (lastChunk.eval_count || 0)
		},
		// For backward compatibility with existing code that uses the old structure
		message: {
			role: finalRole,
			content: fullContent,
			tool_calls: toolCalls.length > 0 ? toolCalls : undefined
		},
		done: true,
		done_reason: lastChunk.choices[0]?.finish_reason || 'stop',
		eval_count: lastChunk.eval_count,
		prompt_eval_count: lastChunk.prompt_eval_count,
		total_duration: lastChunk.total_duration,
		load_duration: lastChunk.load_duration,
		prompt_eval_duration: lastChunk.prompt_eval_duration,
		eval_duration: lastChunk.eval_duration
	};

	return finalResponse;
}

// ============================================================================
// Conversation Management
// ============================================================================

/**
 * Conversation manager for handling multi-turn interactions
 */
export interface ConversationManagerConfig {
       model: string;
       baseUrl?: string;
       tools?: Tool[];
       options?: ChatOptions;
}

export class ConversationManager {
       private messages: ChatMessage[] = [];
       private model: string;
       private baseUrl?: string;
       private tools?: Tool[];
       private options?: ChatOptions;

       /**
	* Create a new conversation manager
	* @param config - Configuration object for the conversation
	*/
       constructor(config: ConversationManagerConfig) {
	       this.model = config.model;
	       this.baseUrl = config.baseUrl;
	       this.tools = config.tools;
	       this.options = config.options;
       }

	/**
	 * Add a message to the conversation
	 */
	addMessage(role: MessageRole | 'tool', content: string, toolCallId?: string): void {
		this.messages.push({
			role: role as MessageRole | 'tool',
			content,
			tool_call_id: toolCallId
		});
	}

	/**
	 * Add an assistant message with tool calls
	 */
	addAssistantMessage(content: string, toolCalls?: ToolCall[]): void {
		this.messages.push({
			role: 'assistant',
			content,
			tool_calls: toolCalls
		});
	}

	/**
	 * Send a message and get a streaming response
	 */
	async *sendMessage(userMessage: string): AsyncGenerator<ChatStreamChunk, void, unknown> {
		this.addMessage('user', userMessage);

		yield* createStreamingChat({
			model: this.model,
			messages: this.messages,
			tools: this.tools,
			options: this.options
		}, this.baseUrl);
	}

	/**
	 * Send a message and wait for complete response
	 */
	async sendMessageComplete(userMessage: string): Promise<ChatResponse> {
		this.addMessage('user', userMessage);

		const response = await chatStreamComplete({
			model: this.model,
			messages: this.messages,
			tools: this.tools,
			options: this.options
		}, this.baseUrl);

		// Add assistant response to conversation history
		this.addAssistantMessage(response.message.content || '', response.message.tool_calls);

		return response;
	}

	/**
	 * Get conversation history
	 */
	getHistory(): ChatMessage[] {
		return [...this.messages];
	}

	/**
	 * Clear conversation history
	 */
	clear(): void {
		this.messages = [];
	}

	/**
	 * Get the number of messages in the conversation
	 */
	getMessageCount(): number {
		return this.messages.length;
	}
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Convert nanoseconds to milliseconds
 */
export function nsToMs(nanoseconds: number): number {
	return nanoseconds / 1_000_000;
}

/**
 * Convert nanoseconds to seconds
 */
export function nsToSeconds(nanoseconds: number): number {
	return nanoseconds / 1_000_000_000;
}

/**
 * Format duration metrics from a response
 */
export interface DurationMetrics {
	totalMs: number;
	loadMs: number;
	promptEvalMs: number;
	evalMs: number;
	tokensPerSecond: number;
}

export function formatDurations(response: ChatResponse): DurationMetrics {
	const totalMs = response.total_duration ? nsToMs(response.total_duration) : 0;
	const loadMs = response.load_duration ? nsToMs(response.load_duration) : 0;
	const promptEvalMs = response.prompt_eval_duration ? nsToMs(response.prompt_eval_duration) : 0;
	const evalMs = response.eval_duration ? nsToMs(response.eval_duration) : 0;

	// Calculate tokens per second
	const tokensPerSecond =
		response.eval_count && response.eval_duration
			? response.eval_count / nsToSeconds(response.eval_duration)
			: 0;

	return {
		totalMs,
		loadMs,
		promptEvalMs,
		evalMs,
		tokensPerSecond
	};
}
