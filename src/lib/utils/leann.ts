/**
 * Leann Vector Database API Client
 *
 * A TypeScript wrapper for the Leann FastAPI server that provides
 * document indexing and semantic search capabilities.
 */

/**
 * Document to be indexed in Leann
 */
export interface LeannDocument {
	/** The document content to index */
	text: string;
	/** Optional metadata associated with the document */
	metadata?: Record<string, unknown>;
}

/**
 * Parameters for saving documents to Leann
 */
export interface SaveDocumentsParams {
	/** Array of documents to save */
	documents: LeannDocument[];
}

/**
 * Response from saving documents
 */
export interface SaveDocumentsResponse {
	status: 'success' | 'error';
	action: 'created' | 'appended';
	count: number;
	index_path: string;
}

/**
 * Search result from Leann
 */
export interface LeannSearchResult {
	id: string;
	text: string;
	score: number;
	metadata: Record<string, unknown>;
}

/**
 * Parameters for searching documents
 */
export interface SearchDocumentsParams {
	/** The search query */
	query: string;
	/** Number of results to return (default: 5) */
	top_k?: number;
	/** Search complexity (default: 64) */
	complexity?: number;
	/** Parallel search paths per iteration (default: 1) */
	beam_width?: number;
	/** Ratio of neighbors to prune (default: 0.0) */
	prune_ratio?: number;
	/** Fetch fresh embeddings vs use stored codes (default: true) */
	recompute_embeddings?: boolean;
	/** Pruning strategy: "global", "local", or "proportional" (default: "global") */
	pruning_strategy?: 'global' | 'local' | 'proportional';
	/** ZMQ server port for embedding recomputation (default: 5557) */
	expected_zmq_port?: number;
	/** Post-search metadata filters (default: null) */
	metadata_filters?: Record<string, unknown> | null;
	/** Batch size for embedding computation (default: 0) */
	batch_size?: number;
	/** Use regex text matching instead of vector search (default: false) */
	use_grep?: boolean;
	/** Embedding provider options (default: null) */
	provider_options?: Record<string, unknown> | null;
}

/**
 * Get the Leann API base URL from environment or default
 */
function getLeannBaseUrl(): string {
	if (typeof window !== 'undefined' && import.meta.env.VITE_LEANN_API_URL) {
		return import.meta.env.VITE_LEANN_API_URL;
	}
	return 'http://localhost:3008';
}

/**
 * Save documents to the Leann index
 *
 * @param documents - Array of documents to save
 * @param metadata - Optional metadata to attach to all documents
 * @returns Promise resolving to the save response
 * @throws Error if the save operation fails
 *
 * @example
 * ```ts
 * const response = await saveDocumentsToLeann([
 *   { text: "Document 1", metadata: { source: "article" } },
 *   { text: "Document 2", metadata: { source: "article" } }
 * ]);
 * console.log(`Saved ${response.count} documents`);
 * ```
 */
export async function saveDocumentsToLeann(
	documents: Array<{ text: string; metadata?: Record<string, unknown> }>,
	metadata?: Record<string, unknown>
): Promise<SaveDocumentsResponse> {
	const baseUrl = getLeannBaseUrl();

	// Merge document-level and call-level metadata
	const formattedDocuments: LeannDocument[] = documents.map((doc) => ({
		text: doc.text,
		metadata: { ...metadata, ...doc.metadata }
	}));

	const response = await fetch(`${baseUrl}/save_documents`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ documents: formattedDocuments })
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Failed to save documents to Leann: ${response.status} - ${error}`);
	}

	return response.json();
}

/**
 * Search the Leann index for documents matching a query
 *
 * @param params - Search parameters
 * @returns Promise resolving to array of search results sorted by score
 * @throws Error if the search operation fails
 *
 * @example
 * ```ts
 * const results = await searchDocumentsInLeann({
 *   question: "What is machine learning?",
 *   top_k: 5
 * });
 *
 * for (const result of results) {
 *   console.log(`Score: ${result.score}, Text: ${result.text.substring(0, 100)}...`);
 * }
 * ```
 */
export async function searchDocumentsInLeann(
	params: SearchDocumentsParams
): Promise<LeannSearchResult[]> {
	const baseUrl = getLeannBaseUrl();

	const searchPayload = {
		query: params.query,
		top_k: params.top_k ?? 5,
		complexity: params.complexity ?? 64,
		beam_width: params.beam_width ?? 1,
		prune_ratio: params.prune_ratio ?? 0.0,
		recompute_embeddings: params.recompute_embeddings ?? true,
		pruning_strategy: params.pruning_strategy ?? 'global',
		expected_zmq_port: params.expected_zmq_port ?? 5557,
		metadata_filters: params.metadata_filters ?? null,
		batch_size: params.batch_size ?? 0,
		use_grep: params.use_grep ?? false,
		provider_options: params.provider_options ?? null
	};

	const response = await fetch(`${baseUrl}/search_documents`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(searchPayload)
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Failed to search documents in Leann: ${response.status} - ${error}`);
	}

	return response.json();
}

/**
 * Health check for the Leann API server
 *
 * @returns Promise that resolves if the server is healthy
 * @throws Error if the server is not reachable
 */
export async function checkLeannHealth(): Promise<void> {
	const baseUrl = getLeannBaseUrl();

	try {
		const response = await fetch(`${baseUrl}/docs`, {
			method: 'HEAD'
		});

		if (!response.ok && response.status !== 404) {
			throw new Error(`Leann server returned status ${response.status}`);
		}
	} catch (error) {
		throw new Error(`Leann server is not reachable at ${baseUrl}: ${error}`);
	}
}

/**
 * ChromaDB-compatible similarity search adapter
 * Converts Leann search results to the format expected by existing code
 */
export interface SimilaritySearchParams {
	query: string;
	nResults?: number;
	whereMetadata?: Record<string, unknown>;
	collectionName?: string;
	includeDocuments?: boolean;
	includeEmbeddings?: boolean;
	model?: string;
	ollamaUrl?: string;
}

/**
 * ChromaDB-compatible search result format
 */
export interface SimilaritySearchResult {
	ids: string[][];
	distances: number[][];
	documents: string[][];
	metadatas: Record<string, unknown>[][];
	embeddings?: number[][][];
}

/**
 * Search for similar documents using Leann
 * Adapts Leann results to ChromaDB format for backward compatibility
 */
export async function similaritySearchCompat(
	params: SimilaritySearchParams
): Promise<SimilaritySearchResult> {
	try {
		const results = await searchDocumentsInLeann({
			query: params.query,
			top_k: params.nResults ?? 5
		});

		// Convert Leann results to ChromaDB format
		// ChromaDB returns results grouped by query (hence the nested arrays)
		const ids = results.map((r) => r.id);
		const distances = results.map((r) => 1 - r.score); // Convert score to distance
		const documents = results.map((r) => r.text);
		const metadatas = results.map((r) => r.metadata);

		return {
			ids: [ids],
			distances: [distances],
			documents: [documents],
			metadatas: [metadatas],
			embeddings: params.includeEmbeddings ? [[]] : undefined
		};
	} catch (error) {
		throw new Error(`Failed to search documents: ${error}`);
	}
}
