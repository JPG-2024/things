import { invoke } from '@tauri-apps/api/core';

/**
 * Parameters for storing embeddings in ChromaDB
 */
export interface StoreEmbeddingsParams {
	/** Array of text strings to be embedded */
	texts: string[];
	/** Metadata object to be associated with all embeddings */
	metadata: Record<string, unknown>;
	/** Unique identifier for the article/document */
	articleId: string;
	/** Embedding model to use (defaults to "nomic-embed-text") */
	model?: string;
	/** Ollama API URL (defaults to http://localhost:11434) */
	ollamaUrl?: string;
	/** Name of the ChromaDB collection */
	collectionName: string;
}

/**
 * Wrapper function to store embeddings in ChromaDB
 *
 * @param params - The parameters for storing embeddings
 * @returns A promise that resolves to a success message
 * @throws Error if the operation fails
 *
 * @example
 * ```ts
 * const result = await storeEmbeddings({
 *   texts: ["Hello world", "Goodbye world"],
 *   metadata: { source: "article", category: "tech" },
 *   articleId: "123",
 *   collectionName: "my_collection"
 * });
 * ```
 */
export async function storeEmbeddings(
	params: StoreEmbeddingsParams
): Promise<string> {
	return invoke<string>('store_embeddings', {
		texts: params.texts,
		metadata: params.metadata,
		articleId: params.articleId,
		model: params.model,
		ollamaUrl: params.ollamaUrl,
		collectionName: params.collectionName,
	});
}
