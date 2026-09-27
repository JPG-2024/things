import { invoke } from '@tauri-apps/api/core';

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

export interface CategoryEmbeddingInput {
	id: string;
	name: string;
	description?: string;
	embedding: number[];
	updatedAt?: number;
	modelName?: string;
	modelDimensions?: number;
}

export interface CategorySearchResult {
	id: string;
	name: string;
	description?: string;
	distance: number;
	modelName?: string;
	modelDimensions?: number;
}

export const CATEGORIES_TABLE = 'categories';

export async function upsertCategoryEmbeddings(items: CategoryEmbeddingInput[]): Promise<number> {
	return invoke('upsert_category_embeddings', { table: CATEGORIES_TABLE, items });
}

export async function searchSimilarCategories(
	embedding: number[],
	limit?: number
): Promise<CategorySearchResult[]> {
	return invoke('search_similar_categories', { table: CATEGORIES_TABLE, embedding, limit });
}

export async function deleteCategoryEmbedding(id: string): Promise<boolean> {
	return invoke('delete_category_embedding', { table: CATEGORIES_TABLE, id });
}

export async function rebuildCategoryEmbeddings(items: CategoryEmbeddingInput[]): Promise<number> {
	return invoke('rebuild_category_embeddings', { table: CATEGORIES_TABLE, items });
}
