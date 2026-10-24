import { invoke } from '@tauri-apps/api/core';
import { createEmbeddings } from '@/lib/utils/inference/llama-completions';
import { EMBEDDING_MODEL } from '@/lib/utils/inference/constants';
import { mergeSearchResults } from '@/lib/utils/embeddingSearch';

export interface ChunkInput {
	articleUrl: string;
	chunkText?: string;
	embedding: number[];
	createdAt?: number;
	category?: string;
	profileId?: string;
	modelName?: string;
	modelDimensions?: number;
	startOffset?: number;
	endOffset?: number;
}

export interface SearchChunkResult {
	id: string;
	articleUrl: string;
	chunkText: string;
	distance: number;
	category?: string;
	profileId?: string;
	modelName?: string;
	modelDimensions?: number;
	startOffset?: number;
	endOffset?: number;
}

export interface SearchChunksParams {
	table: string;
	embedding: number[];
	limit?: number;
	articleUrl?: string;
	category?: string;
	profileId?: string;
	modelName?: string;
	modelDimensions?: number;
}

export async function indexChunks(table: string, chunks: ChunkInput[]): Promise<number> {
	console.log('[embeddings] indexChunks', {
		table,
		chunks
	});
	return invoke('index_chunks', { table, chunks });
}

export async function searchChunks(params: SearchChunksParams): Promise<SearchChunkResult[]> {
	return invoke('search_similar_chunks', { ...params });
}

export async function deleteChunksByArticle(table: string, articleUrl: string): Promise<boolean> {
	return invoke('delete_chunks_by_article', { table, articleUrl });
}

export async function deleteChunk(table: string, id: string): Promise<boolean> {
	return invoke('delete_chunk', { table, id });
}

export async function deleteArticleEmbeddings(articleUrl: string): Promise<boolean> {
	return invoke('delete_article_embeddings', { articleUrl });
}

export interface CategoryExemplarEmbeddingInput {
	id: string;
	categoryId: string;
	articleUrl: string;
	embedding: number[];
	createdAt?: number;
	modelName?: string;
	modelDimensions?: number;
}

export interface CategoryExemplarSearchResult {
	id: string;
	categoryId: string;
	articleUrl: string;
	distance: number;
	modelName?: string;
	modelDimensions?: number;
}

export const CATEGORY_EXEMPLARS_TABLE = 'category_exemplars';

export async function upsertCategoryExemplarEmbeddings(
	items: CategoryExemplarEmbeddingInput[]
): Promise<number> {
	return invoke('upsert_category_exemplar_embeddings', { table: CATEGORY_EXEMPLARS_TABLE, items });
}

export async function searchSimilarCategoryExemplars(
	embedding: number[],
	limit?: number
): Promise<CategoryExemplarSearchResult[]> {
	return invoke('search_similar_category_exemplars', {
		table: CATEGORY_EXEMPLARS_TABLE,
		embedding,
		limit
	});
}

export async function deleteCategoryExemplarEmbedding(id: string): Promise<boolean> {
	return invoke('delete_category_exemplar_embedding', { table: CATEGORY_EXEMPLARS_TABLE, id });
}

export async function deleteCategoryExemplarEmbeddingsByCategory(
	categoryId: string
): Promise<boolean> {
	return invoke('delete_category_exemplar_embeddings_by_category', {
		table: CATEGORY_EXEMPLARS_TABLE,
		categoryId
	});
}

export async function rebuildCategoryExemplarEmbeddings(
	items: CategoryExemplarEmbeddingInput[]
): Promise<number> {
	return invoke('rebuild_category_exemplar_embeddings', {
		table: CATEGORY_EXEMPLARS_TABLE,
		items
	});
}

export interface FindSimilarChunksOptions {
	table: string;
	queryChunks: string[];
	model?: string;
	limit?: number;
	maxResults?: number;
	excludeArticleUrl?: string;
	maxDistance?: number;
	profileId?: string;
	category?: string;
	maxQueryChunks?: number;
}

/**
 * Find chunks similar to the supplied query chunks within an embedding table.
 *
 * Embeds the query chunks (batched), runs a nearest-neighbour search per query
 * against the table, then merges, dedupes, optionally excludes the current
 * article, and returns the closest matches capped by `maxResults`.
 *
 * A table that was never indexed resolves to an empty result set, so callers
 * should treat an empty result as "no embeddings indexed".
 */
export async function findSimilarChunks(
	options: FindSimilarChunksOptions
): Promise<SearchChunkResult[]> {
	const {
		table,
		queryChunks,
		model = EMBEDDING_MODEL,
		limit = 5,
		maxResults = 15,
		excludeArticleUrl,
		maxDistance,
		profileId,
		category,
		maxQueryChunks = 20
	} = options;

	if (queryChunks.length === 0) return [];
	const capped = queryChunks.slice(0, maxQueryChunks);

	const response = await createEmbeddings({ model, input: capped });
	const ordered = [...response.data].sort((a, b) => a.index - b.index);
	const embeddings = ordered.map((entry) => entry.embedding);

	const searches = embeddings.map((embedding) =>
		searchChunks({
			table,
			embedding,
			limit,
			profileId,
			category
		}).catch(() => [] as SearchChunkResult[])
	);

	const perQuery = await Promise.all(searches);

	const seen = new Set<string>();
	const merged: SearchChunkResult[] = [];
	for (const results of perQuery) {
		for (const result of results) {
			if (excludeArticleUrl && result.articleUrl === excludeArticleUrl) continue;
			if (result.id && seen.has(result.id)) continue;
			if (result.id) seen.add(result.id);
			merged.push(result);
		}
	}

	merged.sort((a, b) => a.distance - b.distance);
	const filtered = maxDistance != null ? merged.filter((r) => r.distance <= maxDistance) : merged;

	return filtered.slice(0, maxResults);
}

export interface RetrieveContextChunksOptions {
	/** Embedding tables to search. */
	tables: string[];
	/** Natural-language query; embedded once and searched against every table. */
	query: string;
	model?: string;
	/** Per-table fetch limit before merging. */
	limit?: number;
	maxDistance?: number;
	maxResults?: number;
	excludeArticleUrl?: string;
}

/**
 * Retrieve chunks similar to a free-form query across multiple tables.
 *
 * One `createEmbeddings` call produces the query vector; each table is then
 * searched in parallel with that same vector. Tables that don't exist resolve
 * to empty results, so a missing table is harmless. Failures to embed (service
 * down, request error) return `[]` — callers should treat retrieval as
 * best-effort context, never a hard dependency.
 */
export async function retrieveContextChunks(
	options: RetrieveContextChunksOptions
): Promise<SearchChunkResult[]> {
	const {
		tables,
		query,
		model = EMBEDDING_MODEL,
		limit = 10,
		maxDistance,
		maxResults,
		excludeArticleUrl
	} = options;

	const trimmedTables = tables.map((t) => t.trim()).filter(Boolean);
	const trimmedQuery = query.trim();
	if (trimmedTables.length === 0 || !trimmedQuery) return [];

	let response;
	try {
		response = await createEmbeddings({ model, input: [trimmedQuery] });
	} catch (error) {
		console.error('[embeddings] failed to embed chat query for context retrieval', error);
		return [];
	}

	const embedding = [...response.data].sort((a, b) => a.index - b.index)[0]?.embedding;
	if (!embedding) return [];

	const searches = trimmedTables.map((table) =>
		searchChunks({ table, embedding, limit }).catch(() => [] as SearchChunkResult[])
	);
	const groups = await Promise.all(searches);

	return mergeSearchResults(groups, { excludeArticleUrl, maxDistance, maxResults });
}

/**
 * Stored `chunkText` may carry a heading prefix (`heading\ntext`); strip it
 * for display so tooltips show the readable text after the last newline.
 */
export function displayChunkText(chunkText: string): string {
	if (typeof chunkText !== 'string') return '';
	const parts = chunkText.split('\n');
	return (parts[parts.length - 1] ?? chunkText).trim();
}

/**
 * One tooltip line per matched chunk: `stored text - distance`, chunks
 * without a stored text are skipped.
 */
export function formatSearchChunkTooltip(chunks: SearchChunkResult[]): string {
	return chunks
		.filter((c) => typeof c.chunkText === 'string' && c.chunkText.trim())
		.map((c) => `${displayChunkText(c.chunkText)} - ${c.distance.toFixed(2)}`)
		.join('\n');
}
