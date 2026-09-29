import { createEmbeddings } from '@/lib/utils/inference/llama-completions';
import { EMBEDDING_MODEL } from '@/lib/utils/inference/constants';
import {
	deleteCategoryEmbedding,
	rebuildCategoryEmbeddings,
	searchSimilarCategories,
	upsertCategoryEmbeddings,
	type CategoryEmbeddingInput,
	type CategorySearchResult
} from '@/lib/utils/embeddingStore';
import { getCategories } from '@/stores/webStore';

export type CategoryEmbeddingSource = {
	id: string;
	name: string;
	description?: string | null;
};

const QUERY_KEYWORD_LIMIT = 15;
const QUERY_TOPIC_LIMIT = 30;
// Only used as a fallback when no compact fields are available; a full
// `analysisTopic` summary is an entire merged document and would overflow the
// embeddings context.
const QUERY_SUMMARY_LIMIT = 2000;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function uniqueStrings(values: unknown, limit?: number): string[] {
	if (!Array.isArray(values)) return [];
	const deduped = [
		...new Set(values.filter((v): v is string => typeof v === 'string').map((v) => v.trim()))
	].filter(Boolean);
	return limit != null ? deduped.slice(0, limit) : deduped;
}

export function buildCategoryText(name: string, description?: string | null): string {
	const descriptionText = description?.trim();
	return descriptionText ? `${name}\n${descriptionText}` : name;
}

/**
 * Derive the text used to query the category index from an analysis task result.
 *
 * Handles the recursive `{ chunks, finalResponse }` shape (preferring the
 * compact `topics` + `keywords` the analysis processors emit), a bare string,
 * or a flat string array. `summary` is only used as a capped fallback so a full
 * `analysisTopic` document cannot overflow the embeddings context. Returns an
 * empty string when there is nothing usable to compare.
 */
export function buildCategoryQueryText(taskData: unknown): string {
	if (taskData == null) return '';

	const record = isRecord(taskData) ? taskData : null;
	const source = record && 'finalResponse' in record ? record.finalResponse : taskData;

	if (typeof source === 'string') return source.trim();
	if (Array.isArray(source)) return uniqueStrings(source).join(', ');
	if (isRecord(source)) {
		const topics = uniqueStrings(source.topics, QUERY_TOPIC_LIMIT);
		const keywords = uniqueStrings(source.keywords, QUERY_KEYWORD_LIMIT);
		const compact = [topics.join(', '), keywords.join(', ')].filter(Boolean);
		if (compact.length > 0) return compact.join('\n').trim();

		const summary = typeof source.summary === 'string' ? source.summary.trim() : '';
		return summary.slice(0, QUERY_SUMMARY_LIMIT).trim();
	}

	return '';
}

async function embedTexts(texts: string[], model: string): Promise<number[][]> {
	const response = await createEmbeddings({ model, input: texts });
	return [...response.data].sort((a, b) => a.index - b.index).map((entry) => entry.embedding);
}

async function embedCategoryRecords(
	categories: CategoryEmbeddingSource[],
	model: string
): Promise<CategoryEmbeddingInput[]> {
	const texts = categories.map((category) =>
		buildCategoryText(category.name, category.description)
	);
	const embeddings = await embedTexts(texts, model);
	return categories.map((category, index) => {
		const embedding = embeddings[index];
		return {
			id: category.id,
			name: category.name,
			description: category.description ?? undefined,
			embedding,
			updatedAt: Date.now(),
			modelName: model,
			modelDimensions: embedding.length
		};
	});
}

/**
 * Embed a single category and upsert its vector. Throws when the embeddings
 * service fails so callers can surface the error on create/edit.
 */
export async function syncCategoryEmbedding(
	category: CategoryEmbeddingSource,
	model: string = EMBEDDING_MODEL
): Promise<void> {
	const [input] = await embedCategoryRecords([category], model);
	await upsertCategoryEmbeddings([input]);
}

export async function removeCategoryEmbedding(id: string): Promise<void> {
	await deleteCategoryEmbedding(id);
}

let rebuildPromise: Promise<void> | null = null;

/**
 * Rebuild the derived category index from SQLite. Concurrent calls share a
 * single in-flight rebuild.
 */
export async function rebuildCategoryIndex(
	categories?: CategoryEmbeddingSource[],
	model: string = EMBEDDING_MODEL
): Promise<void> {
	if (rebuildPromise) return rebuildPromise;

	rebuildPromise = (async () => {
		const source = categories ?? (await getCategories());
		if (source.length === 0) {
			await rebuildCategoryEmbeddings([]);
			return;
		}
		const inputs = await embedCategoryRecords(source, model);
		await rebuildCategoryEmbeddings(inputs);
	})().finally(() => {
		rebuildPromise = null;
	});

	return rebuildPromise;
}

export interface ClassifyByEmbeddingOptions {
	topN?: number;
	minSimilarity?: number;
	model?: string;
}

/**
 * Classify a task result into category ids using nearest-neighbour search
 * against the category description vectors.
 *
 * Returns the closest `topN` category ids whose cosine similarity is at least
 * `minSimilarity`, or `[]` when there is nothing to compare or no match.
 */
export async function classifyByEmbedding(
	taskData: unknown,
	options: ClassifyByEmbeddingOptions = {}
): Promise<string[]> {
	const topN = Math.max(1, Math.trunc(options.topN ?? 3));
	const minSimilarity = options.minSimilarity ?? 0.35;
	const model = options.model ?? EMBEDDING_MODEL;

	const queryText = buildCategoryQueryText(taskData);
	if (!queryText) return [];

	const categories = await getCategories();
	if (categories.length === 0) return [];

	const [queryEmbedding] = await embedTexts([queryText], model);

	const search = () => searchSimilarCategories(queryEmbedding, topN);
	let results: CategorySearchResult[];
	try {
		results = await search();
	} catch {
		// Missing or corrupted derived index: rebuild from SQLite and retry once.
		await rebuildCategoryIndex(categories, model);
		results = await search();
	}

	return results
		.filter((result) => 1 - result.distance >= minSimilarity)
		.sort((a, b) => a.distance - b.distance)
		.slice(0, topN)
		.map((result) => result.id);
}
