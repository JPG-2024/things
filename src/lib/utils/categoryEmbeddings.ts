import { createEmbeddings } from '@/lib/utils/inference/llama-completions';
import { EMBEDDING_MODEL } from '@/lib/utils/inference/constants';
import {
	deleteCategoryExemplarEmbedding,
	deleteCategoryExemplarEmbeddingsByCategory,
	rebuildCategoryExemplarEmbeddings,
	searchSimilarCategoryExemplars,
	upsertCategoryExemplarEmbeddings,
	type CategoryExemplarSearchResult
} from '@/lib/utils/embeddingStore';
import {
	deleteCategoryExemplar,
	getAllCategoryExemplars,
	getCategoryExemplarModelStatus,
	saveCategoryExemplar,
	updateCategoryExemplarsModel,
	type WebStoreCategoryExemplarRecord
} from '@/stores/webStore';
import { buildCategoryText, rankExemplarMatches } from '@/lib/utils/categoryText';

export { buildCategoryText, rankExemplarMatches } from '@/lib/utils/categoryText';

// How many nearest exemplars to pull before collapsing to the best match per
// category. Local scale only; keep it comfortably above per-category counts.
const EXEMPLAR_SEARCH_LIMIT = 100;

async function embedTexts(texts: string[], model: string): Promise<number[][]> {
	const response = await createEmbeddings({ model, input: texts });
	return [...response.data].sort((a, b) => a.index - b.index).map((entry) => entry.embedding);
}

/**
 * Feed one article into a category's exemplar set.
 *
 * Embeds the `topics + keywords` text, persists it in SQLite (the source of
 * truth) and upserts the derived vector in LanceDB. Throws when the text is
 * empty or the embeddings service fails, so callers can surface the error.
 */
export async function addCategoryExemplar(
	params: { categoryId: string; articleUrl: string; text: string },
	model: string = EMBEDDING_MODEL
): Promise<WebStoreCategoryExemplarRecord> {
	const text = params.text.trim();
	if (!text) {
		throw new Error('No analysis text available to add to the category');
	}

	const [embedding] = await embedTexts([text], model);
	if (!embedding || embedding.length === 0) {
		throw new Error('Embeddings service returned no vector');
	}

	const record = await saveCategoryExemplar({
		categoryId: params.categoryId,
		articleUrl: params.articleUrl,
		text,
		modelName: model,
		modelDimensions: embedding.length
	});
	if (!record) {
		throw new Error('Failed to persist the category exemplar');
	}

	await upsertCategoryExemplarEmbeddings([
		{
			id: record.id,
			categoryId: params.categoryId,
			articleUrl: params.articleUrl,
			embedding,
			createdAt: record.createdAt,
			modelName: model,
			modelDimensions: embedding.length
		}
	]);

	return record;
}

/** Remove a single exemplar from SQLite and its derived vector. */
export async function removeCategoryExemplar(exemplarId: string): Promise<void> {
	await deleteCategoryExemplar(exemplarId);
	await deleteCategoryExemplarEmbedding(exemplarId);
}

/** Drop every derived exemplar vector for a category (SQLite rows cascade). */
export async function removeCategoryExemplarEmbeddings(categoryId: string): Promise<void> {
	await deleteCategoryExemplarEmbeddingsByCategory(categoryId);
}

/**
 * Rebuild the derived exemplar index from the SQLite source of truth.
 *
 * Re-embeds every stored exemplar text with `model` (one batch call), replaces
 * the LanceDB table, and stamps the rows with the current model signature so a
 * later model change can be detected without rescanning the index.
 */
export async function rebuildCategoryIndex(model: string = EMBEDDING_MODEL): Promise<void> {
	const exemplars = await getAllCategoryExemplars();
	if (exemplars.length === 0) {
		await rebuildCategoryExemplarEmbeddings([]);
		return;
	}

	const embeddings = await embedTexts(
		exemplars.map((exemplar) => exemplar.text),
		model
	);
	const dimensions = embeddings[0]?.length ?? null;

	await rebuildCategoryExemplarEmbeddings(
		exemplars.map((exemplar, index) => ({
			id: exemplar.id,
			categoryId: exemplar.categoryId,
			articleUrl: exemplar.articleUrl,
			embedding: embeddings[index],
			createdAt: exemplar.createdAt,
			modelName: model,
			modelDimensions: dimensions ?? undefined
		}))
	);

	await updateCategoryExemplarsModel({ modelName: model, modelDimensions: dimensions });
}

let validatedIndexModelKey: string | null = null;

/**
 * Rebuild the index when it was built with a different embedding model than the
 * one currently configured. The result is cached per model signature so a
 * classification does not re-check on every run.
 */
async function ensureCategoryExemplarIndexFresh(model: string, dimensions: number): Promise<void> {
	const key = `${model}:${dimensions}`;
	if (validatedIndexModelKey === key) return;

	const status = await getCategoryExemplarModelStatus({
		modelName: model,
		modelDimensions: dimensions
	});
	if (status.total > 0 && status.matching < status.total) {
		await rebuildCategoryIndex(model);
	}

	validatedIndexModelKey = key;
}

export interface ClassifyByEmbeddingOptions {
	topN?: number;
	minSimilarity?: number;
	margin?: number;
	model?: string;
	/** The article title (the `title` task's data), used in `title + summary`. */
	title?: string | null;
}

/**
 * Classify a task result into category ids using nearest-neighbour search over
 * the category exemplars (the fed `title + summary` examples).
 *
 * Returns the `topN` category ids whose best exemplar similarity is at least
 * `minSimilarity`, or `[]` when there is nothing to compare, no match, or the
 * top two categories are within `margin` (ambiguous). A category with no
 * exemplars never matches.
 */
export async function classifyByEmbedding(
	taskData: unknown,
	options: ClassifyByEmbeddingOptions = {}
): Promise<string[]> {
	const topN = Math.max(1, Math.trunc(options.topN ?? 3));
	const minSimilarity = options.minSimilarity ?? 0.5;
	const margin = options.margin ?? 0;
	const model = options.model ?? EMBEDDING_MODEL;

	const queryText = buildCategoryText(taskData, options.title);
	if (!queryText) return [];

	const [queryEmbedding] = await embedTexts([queryText], model);
	if (!queryEmbedding || queryEmbedding.length === 0) return [];

	await ensureCategoryExemplarIndexFresh(model, queryEmbedding.length);

	const search = () => searchSimilarCategoryExemplars(queryEmbedding, EXEMPLAR_SEARCH_LIMIT);
	let results: CategoryExemplarSearchResult[];
	try {
		results = await search();
	} catch {
		// Missing or corrupted derived index (or no exemplars fed yet, so the
		// table does not exist). Rebuild from SQLite and retry once.
		const exemplars = await getAllCategoryExemplars();
		if (exemplars.length === 0) return [];
		await rebuildCategoryIndex(model);
		results = await search();
	}

	// Collapse to the best exemplar per category, then rank the categories.
	return rankExemplarMatches(results, { topN, minSimilarity, margin });
}
