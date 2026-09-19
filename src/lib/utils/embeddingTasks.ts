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

interface EmbeddableItem {
	text: string;
	startOffset?: number;
	endOffset?: number;
}

function collectEmbeddableItems(task: Task): EmbeddableItem[] {
	const data = task.data;
	const items: EmbeddableItem[] = [];

	const pushText = (value: unknown, startOffset?: number, endOffset?: number) => {
		if (typeof value === 'string' && value.trim()) {
			items.push({ text: value, startOffset, endOffset });
		}
	};

	const pushFieldValues = (fieldValue: unknown, startOffset?: number, endOffset?: number) => {
		if (typeof fieldValue === 'string') {
			pushText(fieldValue, startOffset, endOffset);
		} else if (Array.isArray(fieldValue)) {
			for (const v of fieldValue) pushText(v, startOffset, endOffset);
		}
	};

	if (typeof data === 'string') {
		pushText(data);
		return items;
	}
	if (Array.isArray(data)) {
		for (const v of data) pushText(v);
		return items;
	}

	const record = data as Record<string, unknown> | undefined;
	const chunks = record?.chunks;
	if (!Array.isArray(chunks) || chunks.length === 0) return items;

	const field = task.embedField ?? 'topics';

	for (const entry of chunks) {
		if (!entry || typeof entry !== 'object') continue;
		const entryRecord = entry as Record<string, unknown>;
		const key = entryRecord.key as ChunkOffset | undefined;
		const chunkData = entryRecord.data;
		const startOffset = key?.startOffset;
		const endOffset = key?.endOffset;

		if (Array.isArray(chunkData)) {
			for (const v of chunkData) pushText(v, startOffset, endOffset);
		} else if (chunkData && typeof chunkData === 'object') {
			const fieldValue = (chunkData as Record<string, unknown>)[field];
			pushFieldValues(fieldValue, startOffset, endOffset);
		}
	}

	return items;
}

/**
 * Index task outputs into LanceDB embedding tables.
 *
 * Iterates over the provided tasks and, for each task with `embeddings: true`,
 * collects embeddable text items and writes them to a table named after the task id.
 *
 * Supports recursive-shaped results (flat `string[]` chunks), multi-shaped results
 * (object chunks with a selected field via `task.embedField`, default `'topics'`),
 * bare `string[]`, or a plain `string`.
 *
 * `chunkText` is stored only for tasks that opt in via `storeChunkText: true`.
 * When unset, the search side reconstructs the text from raw article content
 * using `startOffset` / `endOffset` as a fallback.
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

			const items = collectEmbeddableItems(task);
			if (items.length === 0) continue;

			let response;
			try {
				const flatTexts = items.map((i) => i.text);
				response = await createEmbeddings({ model: options.model, input: flatTexts });
			} catch (error) {
				console.error(`[embeddings] failed to embed task "${task.id}" for table "${table}"`, error);
				continue;
			}

			const ordered = [...response.data].sort((a, b) => a.index - b.index);
			const inputs: ChunkInput[] = ordered.map((entry, i) => ({
				articleUrl,
				chunkText: task.storeChunkText ? items[i].text : undefined,
				embedding: entry.embedding,
				startOffset: items[i].startOffset,
				endOffset: items[i].endOffset,
				modelName: options.model,
				modelDimensions: entry.embedding.length,
				profileId: options.profileId,
				category: options.category
			}));

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
 * Handles recursive result shapes (flat `string[]` chunks), multi-shaped results
 * (object chunks with a selected `field`), a bare string, or an array of strings.
 * Anything else yields an empty list (nothing to compare).
 */
export function extractQueryChunks(data: unknown, field = 'topics'): string[] {
	if (data == null) return [];
	if (typeof data === 'string') return [data];
	if (Array.isArray(data)) {
		return data.filter((chunk): chunk is string => typeof chunk === 'string');
	}
	if (typeof data === 'object') {
		const record = data as Record<string, unknown>;
		const chunks = record.chunks;
		if (Array.isArray(chunks)) {
			const items: string[] = [];
			for (const entry of chunks) {
				if (!entry || typeof entry !== 'object') continue;
				const e = entry as Record<string, unknown>;
				const chunkData = e.data;
				if (Array.isArray(chunkData)) {
					items.push(...chunkData.filter((v): v is string => typeof v === 'string'));
				} else if (chunkData && typeof chunkData === 'object') {
					const fieldValue = (chunkData as Record<string, unknown>)[field];
					if (typeof fieldValue === 'string') items.push(fieldValue);
					else if (Array.isArray(fieldValue))
						items.push(...fieldValue.filter((v): v is string => typeof v === 'string'));
				}
			}
			if (items.length > 0) return items;
		}
		const finalResponse = record.finalResponse;
		if (finalResponse && typeof finalResponse === 'object') {
			const fieldValue = (finalResponse as Record<string, unknown>)[field];
			if (typeof fieldValue === 'string') return [fieldValue];
			if (Array.isArray(fieldValue))
				return fieldValue.filter((v): v is string => typeof v === 'string');
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
