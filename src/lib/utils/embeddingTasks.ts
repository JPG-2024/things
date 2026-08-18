import { createEmbeddings } from '@/lib/utils/inference/llama-completions';
import {
	indexChunks,
	searchChunks,
	type ChunkInput,
	type SearchChunkResult
} from '@/lib/utils/embeddingStore';
import { EMBEDDING_MODEL } from '@/lib/utils/inference/constants';
import type { Task } from '@/types/taskRunner.types';
import { viewState } from '@/stores/viewStore.svelte';

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

export interface GenerateEmbeddingsOptions {
	model: string;
	profileId?: string;
	category?: string;
}

interface ChunkOffset {
	startOffset?: number;
	endOffset?: number;
}

interface RecursiveChunkEntry {
	key?: ChunkOffset;
	data?: unknown;
}

interface RecursiveLikeData {
	chunks?: unknown;
}

function isChunkEntry(entry: unknown): entry is RecursiveChunkEntry {
	if (!entry || typeof entry !== 'object') return false;
	const record = entry as Record<string, unknown>;
	return 'key' in record || 'data' in record;
}

function isRecursiveData(
	data: unknown
): data is { chunks: Array<{ key: ChunkOffset; data: string }> } {
	if (!data || typeof data !== 'object') return false;
	const record = data as Record<string, unknown>;
	const chunks = record.chunks;
	if (!Array.isArray(chunks) || chunks.length === 0) return false;
	return chunks.every((entry) => {
		if (!isChunkEntry(entry)) return false;
		const e = entry as RecursiveChunkEntry;
		return typeof e.data === 'string' && e.key && typeof e.key === 'object';
	});
}

/**
 * Index task outputs into LanceDB embedding tables.
 *
 * Iterates over the provided tasks and, for each task with `embeddings: true`,
 * embeds its result chunks and writes them to a table named after the task id.
 * Only recursive-shaped results (`chunks` with `{ key, data }` entries) are
 * supported for now; other task shapes are skipped.
 *
 * `chunkText` is intentionally omitted from the stored chunks: the search side
 * reconstructs the text from the raw article content using `startOffset` /
 * `endOffset`.
 */
export async function generateEmbeddingsFromTasks(
	tasks: Task[],
	articleUrl: string,
	options: GenerateEmbeddingsOptions
): Promise<void> {
	viewState.embeddingsLoading = true;
	try {
		for (const task of tasks) {
			if (!task.embeddings) continue;
			const table = task.id;

			const data = task.data as RecursiveLikeData | undefined;
			if (!isRecursiveData(data)) continue;

			const { chunks } = data;
			if (chunks.length === 0) continue;

			const texts = chunks.map((c) => c.data);

			let response;
			try {
				response = await createEmbeddings({ model: options.model, input: texts });
			} catch (error) {
				console.error(`[embeddings] failed to embed task "${task.id}" for table "${table}"`, error);
				continue;
			}

			const ordered = [...response.data].sort((a, b) => a.index - b.index);
			const inputs: ChunkInput[] = chunks.map((entry, i) => {
				const embedding = ordered[i]?.embedding ?? [];
				const offset = entry.key ?? {};
				return {
					articleUrl,
					embedding,
					startOffset: offset.startOffset,
					endOffset: offset.endOffset,
					modelName: options.model,
					modelDimensions: embedding.length,
					profileId: options.profileId,
					category: options.category
				};
			});

			try {
				await indexChunks(table, inputs);
			} catch (error) {
				console.error(`[embeddings] failed to index task "${task.id}" into "${table}"`, error);
			}
		}
	} finally {
		viewState.embeddingsLoading = false;
	}
}

/**
 * Best-effort extraction of an article category from a run's task results.
 * Looks for a task whose subtype indicates categorization and returns its
 * first scalar value, if any.
 */
export function extractCategoryFromTasks(tasks: Task[]): string | undefined {
	const categoryTask = tasks.find(
		(task) => task.subtype === 'category' || task.subtype === 'categorization'
	);
	if (!categoryTask) return undefined;

	const data = categoryTask.data;
	if (typeof data === 'string') return data;
	if (Array.isArray(data) && typeof data[0] === 'string') return data[0];
	return undefined;
}

/**
 * Derive a list of query strings to embed from a task's data.
 *
 * Handles the recursive result shape (`chunks` with `{ key, data }` entries), a bare string, or an
 * array of strings. Anything else yields an empty list (nothing to compare).
 */
export function extractQueryChunks(data: unknown): string[] {
	if (data == null) return [];
	if (typeof data === 'string') return [data];
	if (Array.isArray(data)) {
		return data.filter((chunk): chunk is string => typeof chunk === 'string');
	}
	if (typeof data === 'object') {
		const record = data as Record<string, unknown>;
		const chunks = record.chunks;
		if (Array.isArray(chunks)) {
			return chunks
				.filter(
					(entry): entry is { key: ChunkOffset; data: string } =>
						isChunkEntry(entry) && typeof (entry as RecursiveChunkEntry).data === 'string'
				)
				.map((entry) => entry.data);
		}
	}
	return [];
}

/**
 * Find chunks similar to a task's own data within its embedding table.
 *
 * Embeds the supplied query chunks (batched), runs a nearest-neighbour search
 * per query against the LanceDB table named after the task, then merges,
 * dedupes, optionally excludes the current article, and returns the closest
 * matches capped by `maxResults`.
 *
 * The table may not exist yet (task never indexed); callers should treat an
 * empty result set as "no embeddings indexed".
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
			seen.add(result.id);
			merged.push(result);
		}
	}

	merged.sort((a, b) => a.distance - b.distance);
	const filtered = maxDistance != null ? merged.filter((r) => r.distance <= maxDistance) : merged;
	return filtered.slice(0, maxResults);
}
