import { invoke } from '@tauri-apps/api/core';

export interface ChunkInput {
	articleUrl: string;
	chunkText: string;
	embedding: number[];
	createdAt?: number;
	category?: string;
	profileId?: string;
	modelName?: string;
	modelDimensions?: number;
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
}

export interface SearchChunksParams {
	embedding: number[];
	limit?: number;
	articleUrl?: string;
	category?: string;
	profileId?: string;
	modelName?: string;
	modelDimensions?: number;
}

export async function indexChunks(chunks: ChunkInput[]): Promise<number> {
	return invoke('index_chunks', { chunks });
}

export async function searchChunks(params: SearchChunksParams): Promise<SearchChunkResult[]> {
	return invoke('search_similar_chunks', { ...params });
}

export async function deleteChunksByArticle(articleUrl: string): Promise<boolean> {
	return invoke('delete_chunks_by_article', { articleUrl });
}

export async function deleteChunk(id: string): Promise<boolean> {
	return invoke('delete_chunk', { id });
}
