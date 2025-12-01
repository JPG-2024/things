/**
 * Ollama Generate API
 * Complete TypeScript implementation for the /api/generate endpoint
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Model-specific options for generation
 */
export interface GenerateOptions {
	/** Number of tokens to predict (-1 for infinite, -2 for fill context) */
	num_predict?: number;
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
 * Request body for the generate API
 */
export interface GenerateRequest {
	/** Model name (required) */
	model: string;
	/** Prompt text (required) */
	prompt: string;
	/** Text to append after the model's response */
	suffix?: string;
	/** Base64-encoded images for multimodal models */
	images?: string[];
	/** Response format ('json' for JSON mode) */
	format?: string | { type: 'json' };
	/** System message to override model's system prompt */
	system?: string;
	/** Enable streaming responses (default: true) */
	stream?: boolean;
	/** Enable extended thinking/reasoning mode */
	think?: boolean;
	/** Bypass prompt templating (use raw prompt) */
	raw?: boolean;
	/** Time to keep model loaded (e.g., "5m", "10s") */
	keep_alive?: string | number;
	/** Model-specific options */
	options?: GenerateOptions;
	/** Return log probabilities with response */
	logprobs?: boolean;
	/** Number of top log probabilities to return per token */
	top_logprobs?: number;
}

/**
 * Response from the generate API (non-streaming)
 */
export interface GenerateResponse {
	/** Model name used */
	model: string;
	/** Timestamp of creation */
	created_at: string;
	/** Generated response text */
	response: string;
	/** Extended thinking/reasoning (if think mode enabled) */
	thinking?: string;
	/** Whether generation is complete */
	done: boolean;
	/** Reason for completion (e.g., "stop", "length") */
	done_reason?: string;
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
	/** Context data for continued generation */
	context?: number[];
}

/**
 * Streaming chunk from the generate API
 */
export interface GenerateStreamChunk extends GenerateResponse {
	/** Partial response text in this chunk */
	response: string;
	/** Whether this is the final chunk */
	done: boolean;
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Generate a response using the Ollama API (non-streaming)
 * 
 * @param request - The generation request configuration
 * @param baseUrl - Base URL for Ollama API (default: http://localhost:11434)
 * @returns Promise resolving to the complete generated response
 * 
 * @example
 * ```typescript
 * const response = await generate({
 *   model: 'llama2',
 *   prompt: 'Why is the sky blue?',
 *   options: { temperature: 0.7 }
 * });
 * console.log(response.response);
 * ```
 */
export async function generate(
	request: GenerateRequest,
	baseUrl: string = 'http://localhost:11434'
): Promise<GenerateResponse> {
	const url = `${baseUrl}/api/generate`;

	// Force streaming off for non-streaming function
	const body: GenerateRequest = {
		...request,
		stream: false
	};

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
			throw new Error(
				`Ollama API error (${response.status}): ${errorText}`
			);
		}

		const data: GenerateResponse = await response.json();
		return data;
	} catch (error) {
		if (error instanceof Error) {
			throw new Error(`Failed to generate response: ${error.message}`);
		}
		throw error;
	}
}

/**
 * Generate a response using the Ollama API with streaming
 * 
 * @param request - The generation request configuration
 * @param baseUrl - Base URL for Ollama API (default: http://localhost:11434)
 * @returns AsyncGenerator yielding response chunks as they arrive
 * 
 * @example
 * ```typescript
 * for await (const chunk of generateStream({
 *   model: 'llama2',
 *   prompt: 'Tell me a story'
 * })) {
 *   process.stdout.write(chunk.response);
 *   if (chunk.done) {
 *     console.log('\nGeneration complete!');
 *   }
 * }
 * ```
 */
export async function* generateStream(
	request: GenerateRequest,
	baseUrl: string = 'http://localhost:11434'
): AsyncGenerator<GenerateStreamChunk, void, unknown> {
	const url = `${baseUrl}/api/generate`;

	// Force streaming on for streaming function
	const body: GenerateRequest = {
		...request,
		stream: true
	};

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
			throw new Error(
				`Ollama API error (${response.status}): ${errorText}`
			);
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

			// Process complete lines (NDJSON format)
			const lines = buffer.split('\n');
			buffer = lines.pop() || ''; // Keep incomplete line in buffer

			for (const line of lines) {
				if (line.trim()) {
					try {
						const chunk: GenerateStreamChunk = JSON.parse(line);
						yield chunk;

						// Exit if generation is complete
						if (chunk.done) {
							return;
						}
					} catch (parseError) {
						console.error('Failed to parse chunk:', parseError);
						// Continue processing other lines
					}
				}
			}
		}

		// Process any remaining data in buffer
		if (buffer.trim()) {
			try {
				const chunk: GenerateStreamChunk = JSON.parse(buffer);
				yield chunk;
			} catch (parseError) {
				console.error('Failed to parse final chunk:', parseError);
			}
		}
	} catch (error) {
		if (error instanceof Error) {
			throw new Error(`Failed to generate streaming response: ${error.message}`);
		}
		throw error;
	}
}

/**
 * Helper function to collect all chunks from a streaming response into a single response
 * 
 * @param request - The generation request configuration
 * @param baseUrl - Base URL for Ollama API (default: http://localhost:11434)
 * @returns Promise resolving to the complete response with all chunks combined
 * 
 * @example
 * ```typescript
 * const response = await generateStreamComplete({
 *   model: 'llama2',
 *   prompt: 'Write a poem'
 * });
 * console.log(response.response); // Full poem
 * console.log(response.eval_count); // Total tokens generated
 * ```
 */
export async function generateStreamComplete(
	request: GenerateRequest,
	baseUrl: string = 'http://localhost:11434'
): Promise<GenerateResponse> {
	let fullResponse = '';
	let fullThinking = '';
	let lastChunk: GenerateStreamChunk | null = null;

	for await (const chunk of generateStream(request, baseUrl)) {
		fullResponse += chunk.response;
		if (chunk.thinking) {
			fullThinking += chunk.thinking;
		}
		lastChunk = chunk;
	}

	if (!lastChunk) {
		throw new Error('No chunks received from streaming response');
	}

	// Return the last chunk with the full accumulated response
	return {
		...lastChunk,
		response: fullResponse,
		thinking: fullThinking || undefined
	};
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

export function formatDurations(response: GenerateResponse): DurationMetrics {
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
