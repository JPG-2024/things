/**
 * LlamaCpp Service - HTTP Client for llama-server
 *
 * Connects to an existing llama-server running on HTTP
 * and provides streaming completion and embeddings functionality.
 */

import { invoke } from "@tauri-apps/api/core"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"

// Default server URL (must match llama-server configuration)
const DEFAULT_SERVER_URL = "http://127.0.0.1:8080"

interface StreamCompletionParams {
	serverUrl?: string
	model: string
	prompt: string
	system?: string
	temperature?: number
	maxTokens?: number
}

interface StreamEvent {
	status: "loading" | "streaming" | "done"
	content?: string
	model?: string
	done?: boolean
}

interface ErrorEvent {
	error: string
}

/**
 * Generate completion with streaming
 *
 * @example
 * ```typescript
 * const unlisten = await streamCompletion({
 *   model: 'llama',
 *   prompt: 'Tell me about Rust',
 *   system: 'You are a helpful assistant',
 *   temperature: 0.7,
 *   maxTokens: 512
 * }, (content) => {
 *   console.log('Token:', content);
 * });
 * ```
 */
export async function streamCompletion(
	params: StreamCompletionParams,
	onToken: (content: string) => void,
	onError?: (error: string) => void,
): Promise<UnlistenFn> {
	let streamUnlisten: UnlistenFn | undefined
	let errorUnlisten: UnlistenFn | undefined
	let fullContent = ""

	// Listen for stream events
	streamUnlisten = await listen<StreamEvent>("llama-cpp-stream", (event) => {
		const { status, content, done } = event.payload

		if (status === "loading") {
			console.log("Loading model...")
		} else if (status === "streaming" && content) {
			fullContent += content
			onToken(content)
		} else if (status === "done" || done) {
			console.log("Stream completed")
			streamUnlisten?.()
			errorUnlisten?.()
		}
	})

	// Listen for error events
	errorUnlisten = await listen<ErrorEvent>("llama-cpp-error", (event) => {
		const { error } = event.payload
		console.error("LlamaCpp error:", error)
		if (onError) {
			onError(error)
		}
		streamUnlisten?.()
		errorUnlisten?.()
	})

	// Start streaming
	try {
		await invoke("llama_cpp_completion_stream", {
			model: params.model,
			prompt: params.prompt,
			system: params.system,
			temperature: params.temperature,
			maxTokens: params.maxTokens,
		})
	} catch (error) {
		streamUnlisten?.()
		errorUnlisten?.()
		throw error
	}

	// Return combined unlisten function
	return () => {
		streamUnlisten?.()
		errorUnlisten?.()
	}
}

/**
 * Generate embeddings for texts
 *
 * @example
 * ```typescript
 * const embeddings = await generateEmbeddings({
 *   model: 'llama',
 *   texts: ['Hello world', 'Another text']
 * });
 * console.log('Embeddings:', embeddings);
 * ```
 */
export async function generateEmbeddings(params: {
	serverUrl?: string
	model: string
	texts: string[]
}): Promise<number[][]> {
	try {
		const embeddings = await invoke<number[][]>("llama_cpp_embeddings", {
			model: params.model,
			texts: params.texts,
		})
		return embeddings
	} catch (error) {
		console.error("Failed to generate embeddings:", error)
		throw error
	}
}

/**
 * Check if llama-server is healthy and reachable
 *
 * @example
 * ```typescript
 * const isHealthy = await healthCheck();
 * if (isHealthy) {
 *   console.log('Server is ready');
 * }
 * ```
 */
export async function healthCheck(serverUrl?: string): Promise<boolean> {
	try {
		const result = await invoke<boolean>("llama_cpp_health_check", {
			serverUrl: serverUrl || DEFAULT_SERVER_URL,
		})
		return result
	} catch (error) {
		console.error("Health check failed:", error)
		return false
	}
}

/**
 * Helper function to stream completion and accumulate full response
 *
 * @example
 * ```typescript
 * const fullResponse = await streamCompletionFull({
 *   model: 'llama',
 *   prompt: 'Write a poem',
 *   temperature: 0.8
 * }, (token) => {
 *   process.stdout.write(token);
 * });
 * console.log('\n\nFull response:', fullResponse);
 * ```
 */
export async function streamCompletionFull(
	params: StreamCompletionParams,
	onToken?: (content: string) => void,
): Promise<string> {
	return new Promise((resolve, reject) => {
		let fullContent = ""

		streamCompletion(
			params,
			(content) => {
				fullContent += content
				onToken?.(content)
			},
			(error) => {
				reject(new Error(error))
			},
		).catch(reject)

		// Set up timeout to resolve after stream completes
		const checkInterval = setInterval(() => {
			// This is a simple approach - in production you'd want better stream completion detection
			if (fullContent.length > 0) {
				clearInterval(checkInterval)
				setTimeout(() => resolve(fullContent), 1000)
			}
		}, 100)
	})
}
