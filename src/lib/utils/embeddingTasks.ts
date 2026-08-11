import { createEmbeddings } from '@/lib/utils/inference/llama-completions';
import { indexChunks, type ChunkInput } from '@/lib/utils/embeddingStore';
import type { Task } from '@/types/taskRunner.types';

export interface GenerateEmbeddingsOptions {
	model: string;
	profileId?: string;
	category?: string;
}

interface ChunkOffset {
	startOffset?: number;
	endOffset?: number;
}

interface RecursiveLikeData {
	chunks?: unknown;
	chunkOffsets?: unknown;
}

function isRecursiveData(data: unknown): data is { chunks: string[]; chunkOffsets: ChunkOffset[] } {
	if (!data || typeof data !== 'object') return false;
	const record = data as Record<string, unknown>;
	const chunks = record.chunks;
	const offsets = record.chunkOffsets;
	return (
		Array.isArray(chunks) &&
		chunks.every((chunk) => typeof chunk === 'string') &&
		Array.isArray(offsets)
	);
}

/**
 * Index task outputs into LanceDB embedding tables.
 *
 * Iterates over the provided tasks and, for each task that declares an
 * `embeddingTable`, embeds its result chunks and writes them to that table.
 * Only recursive-shaped results (`chunks` + `chunkOffsets`) are supported for
 * now; other task shapes are skipped.
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
	for (const task of tasks) {
		const table = task.embeddingTable;
		if (!table) continue;

		const data = task.data as RecursiveLikeData | undefined;
		if (!isRecursiveData(data)) continue;

		const { chunks, chunkOffsets } = data;
		if (chunks.length === 0) continue;

		let response;
		try {
			response = await createEmbeddings({ model: options.model, input: chunks });
		} catch (error) {
			console.error(`[embeddings] failed to embed task "${task.id}" for table "${table}"`, error);
			continue;
		}

		const ordered = [...response.data].sort((a, b) => a.index - b.index);
		const inputs: ChunkInput[] = chunks.map((text, i) => {
			const embedding = ordered[i]?.embedding ?? [];
			const offset = chunkOffsets[i] ?? {};
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

		console.log(inputs);

		try {
			await indexChunks(table, inputs);
		} catch (error) {
			console.error(`[embeddings] failed to index task "${task.id}" into "${table}"`, error);
		}
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
