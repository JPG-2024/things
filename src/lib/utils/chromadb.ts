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
	collectionName?: string;
}

/**
 * Parameters for similarity search in ChromaDB
 */
export interface SimilaritySearchParams {
	/** Query text to search for similar documents */
	queryText: string;
	/** Name of the ChromaDB collection to search in */
	collectionName?: string;
	/** Maximum number of results to return (defaults to 5) */
	nResults?: number;
	/** Metadata filter object to narrow down results */
	whereMetadata?: Record<string, unknown>;
	/** Whether to include document text in results (defaults to true) */
	includeDocuments?: boolean;
	/** Whether to include embeddings in results (defaults to false) */
	includeEmbeddings?: boolean;
	/** Embedding model to use (defaults to "nomic-embed-text") */
	model?: string;
	/** Ollama API URL (defaults to http://localhost:11434) */
	ollamaUrl?: string;
}

/**
 * Result from a similarity search query
 */
export interface SimilaritySearchResult {
	/** Array of document IDs matching the query */
	ids: string[][];
	/** Array of distances (similarity scores) */
	distances: number[][];
	/** Array of documents matching the query */
	documents: string[][];
	/** Array of metadata objects associated with the documents */
	metadatas: Record<string, unknown>[][];
	/** Array of embeddings (if requested) */
	embeddings?: number[][][];
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
		collectionName: params.collectionName || 'default_collection',
	});
}

/**
 * Wrapper function to perform similarity search in ChromaDB
 *
 * @param params - The parameters for similarity search
 * @returns A promise that resolves to search results containing matching documents and their scores
 * @throws Error if the operation fails
 *
 * @example
 * ```ts
 * const results = await similaritySearch({
 *   queryText: "machine learning algorithms",
 *   collectionName: "articles",
 *   nResults: 5,
 *   whereMetadata: { category: "AI" }
 * });
 * ```
 */
export async function similaritySearch(
	params: SimilaritySearchParams
): Promise<SimilaritySearchResult> {
	return invoke<SimilaritySearchResult>('similarity_search', {
		queryText: params.queryText,
		collectionName: params.collectionName || 'default_collection',
		nResults: params.nResults || 5,
		whereMetadata: params.whereMetadata,
		includeDocuments: params.includeDocuments,
		includeEmbeddings: params.includeEmbeddings,
		model: params.model,
		ollamaUrl: params.ollamaUrl,
	});
}
