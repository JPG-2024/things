/**
 * Ollama Chat API
 * Complete TypeScript implementation for the /api/chat endpoint
 */

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
 * Send a chat message to Ollama API (non-streaming)
 * 
 * @param request - The chat request configuration
 * @param baseUrl - Base URL for Ollama API (default: http://localhost:11434)
 * @returns Promise resolving to the complete chat response
 * 
 * @example
 * ```typescript
 * const response = await chat({
 *   model: 'llama2',
 *   messages: [
 *     { role: 'user', content: 'What is the capital of France?' }
 *   ]
 * });
 * console.log(response.message.content);
 * ```
 */
export async function chat(
	request: ChatRequest,
	baseUrl: string = 'http://localhost:8080'
): Promise<ChatResponse> {
	const url = `${baseUrl}/v1/chat/completions`;

	// Force streaming off for non-streaming function
	const body: Partial<ChatRequest> & { stream: false } = {
		...request,
		stream: false
	};

	if (body.options?.num_predict) {
		body.max_tokens = body.options.num_predict;
	}
	if (body.options) {
		if (body.options.temperature) body.temperature = body.options.temperature;
		if (body.options.top_p) body.top_p = body.options.top_p;
		if (body.options.stop) body.stop = body.options.stop;
		if (body.options.seed) body.seed = body.options.seed;
		if (body.options.presence_penalty) body.presence_penalty = body.options.presence_penalty;
		if (body.options.frequency_penalty) body.frequency_penalty = body.options.frequency_penalty;
	}
	if (body.format === 'json') {
		body.response_format = { type: 'json_object' };
	}

	delete body.options;
	delete body.keep_alive;
	delete body.format;
	delete body.think;

	try {
		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(body)
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`Ollama Chat API error (${response.status}): ${errorText}`);
		}

		const data = await response.json();

		// Adapt OpenAI response to original ChatResponse structure for compatibility
		const choice = data.choices[0];
		const adaptedResponse: ChatResponse = {
			...data,
			message: choice.message,
			done: true,
			done_reason: choice.finish_reason,
			created_at: new Date(data.created * 1000).toISOString(),
			eval_count: data.usage?.completion_tokens,
			prompt_eval_count: data.usage?.prompt_tokens,
			logprobs: choice.logprobs?.content ?? undefined
		};

		return adaptedResponse;
	} catch (error) {
		if (error instanceof Error) {
			throw new Error(`Failed to send chat message: ${error.message}`);
		}
		throw error;
	}
}

/**
 * Send a chat message with streaming responses
 * 
 * @param request - The chat request configuration
 * @param baseUrl - Base URL for Ollama API (default: http://localhost:11434)
 * @returns AsyncGenerator yielding response chunks as they arrive
 * 
 * @example
 * ```typescript
 * for await (const chunk of chatStream({
 *   model: 'llama2',
 *   messages: [
 *     { role: 'user', content: 'Tell me about TypeScript' }
 *   ]
 * })) {
 *   process.stdout.write(chunk.message.content);
 *   if (chunk.done) {
 *     console.log('\nConversation complete!');
 *   }
 * }
 * ```
 */
export async function* chatStream(
	request: ChatRequest,
	baseUrl: string = 'http://localhost:8080'
): AsyncGenerator<ChatStreamChunk, void, unknown> {
	const url = `${baseUrl}/v1/chat/completions`;

	// Force streaming on for streaming function
	const body: Partial<ChatRequest> & { stream: true } = {
		...request,
		stream: true
	};

	if (body.options?.num_predict) {
		body.max_tokens = body.options.num_predict;
	}
	if (body.options) {
		if (body.options.temperature) body.temperature = body.options.temperature;
		if (body.options.top_p) body.top_p = body.options.top_p;
		if (body.options.stop) body.stop = body.options.stop;
		if (body.options.seed) body.seed = body.options.seed;
		if (body.options.presence_penalty) body.presence_penalty = body.options.presence_penalty;
		if (body.options.frequency_penalty) body.frequency_penalty = body.options.frequency_penalty;
	}
	if (body.format === 'json') {
		body.response_format = { type: 'json_object' };
	}

	delete body.options;
	delete body.keep_alive;
	delete body.format;
	delete body.think;

	try {
		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(body)
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`Ollama Chat API error (${response.status}): ${errorText}`);
		}

		if (!response.body) {
			throw new Error('Response body is null');
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';

		while (true) {
			const { done, value } = await reader.read();

			if (done) break;

			// Decode the chunk and add to buffer
			buffer += decoder.decode(value, { stream: true });

			// Process complete lines (NDJSON format with "data: " prefix)
			const lines = buffer.split('\n');
			buffer = lines.pop() || ''; // Keep incomplete line in buffer

			for (const line of lines) {
				if (line.trim().startsWith('data: ')) {
					const jsonStr = line.trim().substring('data: '.length);
					if (jsonStr === '[DONE]') {
						return;
					}
					try {
						const chunk = JSON.parse(jsonStr);

						// Adapt OpenAI stream chunk to original ChatStreamChunk structure
						const delta = chunk.choices[0]?.delta ?? {};
						const finish_reason = chunk.choices[0]?.finish_reason;

						const adaptedChunk: ChatStreamChunk = {
							...chunk,
							message: {
								role: delta.role || 'assistant',
								content: delta.content || '',
								tool_calls: delta.tool_calls
							},
							done: !!finish_reason,
							done_reason: finish_reason
						};

						yield adaptedChunk;

						// Exit if generation is complete
						if (adaptedChunk.done) {
							// The final chunk in llama-cpp-python server might contain usage stats
							// We can yield one last time if there's usage info.
							if (chunk.usage) {
								const finalChunk: ChatStreamChunk = {
									...adaptedChunk,
									done: true,
									prompt_eval_count: chunk.usage.prompt_tokens,
									eval_count: chunk.usage.completion_tokens
								};
								yield finalChunk;
							}
							return;
						}
					} catch (parseError) {
						console.error('Failed to parse chat chunk:', parseError, 'line:', line);
						// Continue processing other lines
					}
				}
			}
		}
	} catch (error) {
		if (error instanceof Error) {
			throw new Error(`Failed to send streaming chat message: ${error.message}`);
		}
		throw error;
	}
}

/**
 * Helper function to collect all chunks from a streaming chat into a single response
 * 
 * @param request - The chat request configuration
 * @param baseUrl - Base URL for Ollama API (default: http://localhost:11434)
 * @returns Promise resolving to the complete response with all chunks combined
 * 
 * @example
 * ```typescript
 * const response = await chatStreamComplete({
 *   model: 'llama2',
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
	baseUrl: string = 'http://localhost:11434'
): Promise<ChatResponse> {
	let fullContent = '';
	let toolCalls: ToolCall[] = [];
	let lastChunk: ChatStreamChunk | null = null;
	let finalRole: MessageRole = 'assistant';

	for await (const chunk of chatStream(request, baseUrl)) {
		if (chunk.choices[0]?.delta?.content) {
			fullContent += chunk.choices[0].delta.content;
		}
		if (chunk.choices[0]?.delta?.tool_calls) {
			// This part is tricky as tool calls can be streamed token by token.
			// A robust implementation would piece them together.
			// This is a simplified version that assumes they come in one chunk or can be concatenated.
			for (const toolCall of chunk.choices[0].delta.tool_calls) {
				const existing = toolCalls.find((tc) => tc.id === toolCall.id);
				if (existing) {
					if (toolCall.function?.arguments) {
						existing.function.arguments =
							(existing.function.arguments || '') + toolCall.function.arguments;
					}
				} else if (toolCall.id && toolCall.function) {
					toolCalls.push({
						id: toolCall.id,
						function: {
							name: toolCall.function.name || '',
							arguments: toolCall.function.arguments || ''
						},
						// type is not in delta, but is required for ToolCall
						type: 'function'
					} as ToolCall);
				}
			}
		}
		if (chunk.choices[0]?.delta?.role) {
			finalRole = chunk.choices[0].delta.role as MessageRole;
		}
		lastChunk = chunk;
	}

	if (!lastChunk) {
		throw new Error('No chunks received from streaming chat response');
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
		created_at: new Date(lastChunk.created * 1000).toISOString(),
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
export class ConversationManager {
	private messages: ChatMessage[] = [];
	private model: string;
	private baseUrl: string;
	private tools?: Tool[];
	private options?: ChatOptions;

	/**
	 * Create a new conversation manager
	 * 
	 * @param model - The model to use for this conversation
	 * @param baseUrl - Base URL for Ollama API
	 * @param tools - Optional tools available to the model
	 * @param options - Optional model options
	 */
	constructor(
		model: string,
		baseUrl: string = 'http://localhost:8080',
		tools?: Tool[],
		options?: ChatOptions
	) {
		this.model = model;
		this.baseUrl = baseUrl;
		this.tools = tools;
		this.options = options;
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

		yield* chatStream({
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
		this.addAssistantMessage(response.message.content, response.message.tool_calls);

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
