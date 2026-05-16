import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

/**
 * Parameters matching the Rust `generate_completion_stream` command.
 * Keys use the same names as the Rust function (snake_case) so they
 * deserialize correctly when invoking the Tauri command.
 */
export interface GenerateCompletionStreamParams {
	model: string;
	prompt: string;
	system?: string | null;
	context?: number[] | null;
	ollamaUrl?: string | null;
	batchSize?: number | null;
}

/** Example:
 * await generateStream({ model: 'ministral-3:3b', prompt: 'Hello', system: 'You are a creative AI', batch_size: 5 })
 */

async function generateStream(
	params: GenerateCompletionStreamParams,
	callback?: (chunk: string) => void
): Promise<number[]> {
	let fullResponse = '';
	let unlisten: () => void;

	// Listen for streaming events
	unlisten = await listen('ollama-rs-stream', (event: any) => {
		const payload = event.payload;

		if (payload.status === 'loading') {
			console.log('Loading model:', payload.model);
		} else if (payload.status === 'streaming') {
			fullResponse += payload.tokens;

			if (callback) {
				callback(payload.tokens);
			}

			if (payload.done) {
				console.log('Streaming complete!');
				console.log('Full response:', fullResponse);
				unlisten(); // Stop listening
			}
		}
	});

	try {
		// Forward parameters to the Rust command. Use snake_case keys to match Rust
		// signature: model, prompt, system, context, ollama_url, batch_size
		const context = await invoke<number[]>('generate_completion_stream', {
			model: params.model,
			prompt: params.prompt,
			system: params.system,
			context: params.context,
			ollamaUrl: params.ollamaUrl,
			batchSize: params.batchSize
		});

		console.log('Returned context:', context);
		return context;
	} catch (error) {
		console.error('Error:', error);
		unlisten();
		throw error;
	}
}

/**
 * Parameters for generating embeddings in batch
 */
export interface GenerateEmbeddingsBatchParams {
	texts: string[];
	model?: string;
	ollama_url?: string;
}

/**
 * Generate embeddings for multiple texts using Ollama
 * @param GenerateEmbeddingsBatchParams - The parameters for embedding generation
 * @returns A promise resolving to a 2D array of embeddings
 */
async function generateEmbeddingsBatch(params: GenerateEmbeddingsBatchParams): Promise<number[][]> {
	const BATCH_SIZE = 10; // Process 10 chunks at a time to avoid crashing the runner
	const allEmbeddings: number[][] = [];

	try {
		for (let i = 0; i < params.texts.length; i += BATCH_SIZE) {
			const batch = params.texts.slice(i, i + BATCH_SIZE);
			console.log(
				`Generating embeddings for batch ${i / BATCH_SIZE + 1}/${Math.ceil(params.texts.length / BATCH_SIZE)}`
			);

			const batchEmbeddings = await invoke<number[][]>('generate_embeddings_batch', {
				texts: batch,
				model: params.model || 'nomic-embed-text',
				ollama_url: params.ollama_url
			});

			allEmbeddings.push(...batchEmbeddings);
		}

		return allEmbeddings;
	} catch (error) {
		console.error('Error generating embeddings:', error);
		throw error;
	}
}

export { generateStream, generateEmbeddingsBatch };
