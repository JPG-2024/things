import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

// ============================================================================
// Type Definitions & Interfaces
// ============================================================================

/**
 * Message object for chat completions
 */
export interface Message {
  /** The role of the message (e.g., "system", "user", "assistant") */
  role: string;
  /** The content of the message */
  content: string;
}

/**
 * Stream event emitted during completion generation
 */
export interface StreamEvent {
  /** Status of the stream: "loading", "streaming", or "done" */
  status: 'loading' | 'streaming' | 'done';
  /** The model being used */
  model?: string;
  /** The generated content chunk */
  content?: string;
  /** Whether the stream is complete */
  done?: boolean;
  /** Error message if status is error */
  error?: string;
}

/**
 * Parameters for llama-cpp completion with streaming
 */
export interface CompletionStreamParams {
  /** Model identifier: "small", "large", or "embed" */
  model?: string;
  /** The user prompt/input text */
  prompt: string;
  /** Optional system prompt to set the context */
  system?: string;
  /** Temperature for sampling (0.0 - 2.0), controls randomness */
  temperature?: number;
  /** Maximum number of tokens to generate */
  max_tokens?: number;
}

/**
 * Parameters for embedding generation
 */
export interface EmbeddingsParams {
  /** Optional Unix socket path (defaults to /tmp/llama.sock) */
  socket_path?: string;
  /** Model name for embeddings */
  model: string;
  /** List of texts to embed */
  texts: string[];
}

/**
 * Response containing embeddings vectors
 */
export interface EmbeddingsResponse {
  /** Array of embedding vectors (one per input text) */
  embeddings: number[][];
}

/**
 * Health check response
 */
export interface HealthCheckResponse {
  /** Whether the llama-server is healthy */
  healthy: boolean;
}

// ============================================================================
// Tauri Command Wrappers
// ============================================================================

/**
 * Generate a completion with streaming over Unix socket
 * Emits "llama-cpp-stream" events as the response is generated
 *
 * @param params - Completion parameters
 * @param callback - Optional callback function called for each streamed token
 * @returns Promise that resolves when streaming completes
 * @throws {string} Error message if the command fails
 *
 * @example
 * ```typescript
 * await llamaCppCompletionStream({
 *   model: 'small',
 *   prompt: 'What is AI?',
 *   system: 'You are a helpful assistant.',
 *   temperature: 0.7,
 *   max_tokens: 512,
 * }, (token) => {
 *   console.log('Token:', token);
 * });
 * ```
 */
export async function llamaCppCompletionStream(
  params: CompletionStreamParams,
  callback?: (chunk: string) => void
): Promise<void> {
  let fullResponse = '';
  let unlistenFunc: (() => void) | null = null;

  return new Promise((resolve, reject) => {
    // Listen for streaming events
    listen<StreamEvent>('llama-cpp-stream', (event) => {
      const payload = event.payload;

      if (payload.status === 'loading') {
        console.log('Loading model:', payload.model);
      } else if (payload.status === 'streaming' && payload.content) {
        fullResponse += payload.content;

        if (callback) {
          callback(payload.content);
        }
      } else if (payload.status === 'done') {
        console.log('Streaming complete!');
        console.log('Full response:', fullResponse);
        
        // Stop listening after done status is received
        if (unlistenFunc) {
          unlistenFunc();
        }
        resolve();
      }
    })
      .then((unlisten) => {
        unlistenFunc = unlisten;
        
        // Invoke the Rust command AFTER listener is fully attached
        return invoke('llama_cpp_completion_stream', {
          model: params.model,
          prompt: params.prompt,
          system: params.system,
          temperature: params.temperature,
          max_tokens: params.max_tokens,
        });
      })
      .catch((error) => {
        console.error('Error:', error);
        if (unlistenFunc) {
          unlistenFunc();
        }
        reject(error);
      });
  });
}

/**
 * Generate embeddings for one or more texts
 *
 * @param params - Embeddings parameters
 * @returns Array of embedding vectors (one per input text)
 * @throws {string} Error message if the command fails
 *
 * @example
 * ```typescript
 * const embeddings = await llamaCppEmbeddings({
 *   model: 'embed',
 *   texts: ['Hello world', 'Goodbye world'],
 * });
 * console.log(embeddings[0]); // First embedding vector
 * ```
 */
export async function llamaCppEmbeddings(
  params: EmbeddingsParams
): Promise<number[][]> {
  return invoke('llama_cpp_embeddings', {
    socket_path: params.socket_path,
    model: params.model,
    texts: params.texts,
  });
}

/**
 * Check if llama-server is running and healthy
 *
 * @param socketPath - Optional Unix socket path (defaults to /tmp/llama.sock)
 * @returns True if the server is healthy, false otherwise
 *
 * @example
 * ```typescript
 * const isHealthy = await llamaCppHealthCheck();
 * console.log(isHealthy ? 'Server is running' : 'Server is down');
 * ```
 */
export async function llamaCppHealthCheck(
  socketPath?: string
): Promise<boolean> {
  return invoke('llama_cpp_health_check', {
    socket_path: socketPath,
  });
}

// ============================================================================
// Event Listeners
// ============================================================================

/**
 * Listen to streaming events from llama-cpp completion
 * Use this to receive real-time updates while generating completions
 *
 * @param callback - Function called for each stream event
 * @returns Unsubscribe function to stop listening
 *
 * @example
 * ```typescript
 * const unlisten = await onStreamEvent((event) => {
 *   if (event.status === 'streaming') {
 *     console.log('Token:', event.content);
 *   } else if (event.status === 'done') {
 *     console.log('Completion finished');
 *   }
 * });
 *
 * // Later, stop listening
 * unlisten();
 * ```
 */
export async function onStreamEvent(
  callback: (event: StreamEvent) => void
): Promise<() => void> {
  const unlisten = await listen<StreamEvent>('llama-cpp-stream', (event) => {
    callback(event.payload);
  });

  return unlisten;
}

/**
 * Listen to error events from llama-cpp commands
 *
 * @param callback - Function called when an error occurs
 * @returns Unsubscribe function to stop listening
 *
 * @example
 * ```typescript
 * const unlisten = await onStreamError((error) => {
 *   console.error('Llama error:', error.error);
 * });
 * ```
 */
export async function onStreamError(
  callback: (event: { error: string }) => void
): Promise<() => void> {
  const unlisten = await listen<{ error: string }>(
    'llama-cpp-error',
    (event) => {
      callback(event.payload);
    }
  );

  return unlisten;
}
