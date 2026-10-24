/**
 * Indexes the analysis of an article into the embedding store.
 *
 * One table per field: the table is named after the field it indexes, so the
 * default `summary` table keeps the vectors that already exist and no
 * re-indexing is needed.
 */
import { createEmbeddings } from '@/lib/utils/inference/llama-completions';
import { EMBEDDING_MODEL } from '@/lib/utils/inference/constants';
import { indexChunks, type ChunkInput } from '@/lib/utils/embeddingStore';
import { viewState } from '@/stores/viewStore.svelte';
import type { ArticleWindow } from '@/types/articleAnalysis.types';

/** The default table: the window summaries. */
export const DEFAULT_EMBEDDING_TABLE = 'summary';

interface EmbeddableValue {
	text: string;
	start: number;
	end: number;
}

/**
 * Collects the values of one field across every window.
 *
 * A string field yields one value per window; a list field yields one value
 * per entry, all sharing the offsets of their window.
 */
function collectFieldValues(windows: ArticleWindow[], field: string): EmbeddableValue[] {
	const values: EmbeddableValue[] = [];

	for (const window of windows) {
		const raw = window.data?.[field];
		if (typeof raw === 'string') {
			const text = raw.trim();
			if (text) values.push({ text, start: window.start, end: window.end });
			continue;
		}

		if (Array.isArray(raw)) {
			for (const entry of raw) {
				const text = typeof entry === 'string' ? entry.trim() : '';
				if (text) values.push({ text, start: window.start, end: window.end });
			}
		}
	}

	return values;
}

/**
 * Embeds the analysis of an article.
 *
 * Every field is embedded in one call and indexed into the table that carries
 * the same name, so a new analytic is a new table, not a new schema.
 */
export async function embedAnalysis(
	article: { url: string; windows: ArticleWindow[]; categories?: string[] },
	fields: string[] = viewState.embeddingFields
): Promise<void> {
	const usableFields = fields.filter((field) => field.trim().length > 0);
	if (usableFields.length === 0) return;
	if (article.windows.length === 0) return;

	const category = article.categories?.[0];
	const storeChunkText = viewState.embeddingStoreChunkText;

	for (const field of usableFields) {
		const values = collectFieldValues(article.windows, field);
		if (values.length === 0) continue;

		let response;
		try {
			response = await createEmbeddings({
				model: EMBEDDING_MODEL,
				input: values.map((value) => value.text)
			});
		} catch (error) {
			console.error(`[embedAnalysis] failed to embed field "${field}"`, error);
			continue;
		}

		const ordered = [...response.data].sort((a, b) => a.index - b.index);
		const inputs: ChunkInput[] = ordered.map((entry, index) => ({
			articleUrl: article.url,
			chunkText: storeChunkText ? values[index].text : undefined,
			embedding: entry.embedding,
			startOffset: values[index].start,
			endOffset: values[index].end,
			modelName: EMBEDDING_MODEL,
			modelDimensions: entry.embedding.length,
			category
		}));

		try {
			await indexChunks(field, inputs);
		} catch (error) {
			console.error(`[embedAnalysis] failed to index field "${field}"`, error);
		}
	}
}
