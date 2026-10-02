import { chatCompletions } from '@/lib/utils/inference/chat-completions-provider';
import { assistantText } from '@/lib/utils/inference/assistant-text';
import { createEmbeddings } from '@/lib/utils/inference/llama-completions';
import { extractionUpToHelper } from '@/lib/utils/inference/extraction-helper';
import { EMBEDDING_MODEL, SUMMARY_COMPLETION_OPTIONS } from '@/lib/utils/inference/constants';
import {
	ANALYSIS_TOPIC_KEYWORD_DESCRIPTION,
	buildAnalysisTopicSummarySystemMessage,
	buildAnalysisTopicSummaryUserMessage,
	buildAnalysisTopicLabelDescription
} from '@/lib/utils/inference/prompts';
import type {
	AnalysisTopicChunkData,
	AnalysisTopicFinal,
	ProcessorDef,
	TopicSection
} from './types';
import {
	buildBlog,
	buildEmbeddingInput,
	clampCountForChunk,
	clusterByEmbedding,
	clusterFuzzyByLabel,
	ensureTopicPeriod,
	firstSentenceFallback,
	isNoMention,
	mergeSummaries,
	normalizeTopicLabel,
	uniqueStrings,
	type TopicCluster
} from './analysisTopicUtils';

export {
	buildBlog,
	buildEmbeddingInput,
	clampCountForChunk,
	clusterByEmbedding,
	clusterFuzzyByLabel,
	ensureTopicPeriod,
	firstSentenceFallback,
	isNoMention,
	mergeSummaries,
	normalizeTopicLabel,
	uniqueStrings
};
export type { TopicCluster };

export const DEFAULT_TOPIC_COUNT = 1;
export const DEFAULT_KEYWORD_COUNT = 4;
export const DEFAULT_TOPIC_WORD_COUNT = 6;
export const MIN_TOPIC_COUNT = 1;
export const MAX_TOPIC_COUNT = 10;
export const MIN_TOPIC_WORD_COUNT = 1;
export const MAX_TOPIC_WORD_COUNT = 10;
export const DEFAULT_TOPIC_SIMILARITY_THRESHOLD = 0.78;
export const DEFAULT_TOPIC_CONCURRENCY = 2;
export const DEFAULT_MAX_SUMMARY_WORDS = 80;

async function runWithConcurrency<T, R>(
	items: T[],
	limit: number,
	fn: (item: T) => Promise<R>
): Promise<R[]> {
	const capped = Math.max(1, Math.min(limit, items.length || 1));
	if (items.length === 0) return [];
	const results: R[] = new Array(items.length);
	let next = 0;
	const workers = Array.from({ length: Math.min(capped, items.length) }, async () => {
		while (next < items.length) {
			const index = next++;
			results[index] = await fn(items[index]);
		}
	});
	await Promise.all(workers);
	return results;
}

export const analysisTopicProcessor: ProcessorDef = {
	type: 'analysisTopic',
	defaults: {
		userMessage: 'Extract the main topics, summarize each one and extract keywords.'
	},
	build: (config) => {
		const topicCount = Math.min(
			MAX_TOPIC_COUNT,
			Math.max(MIN_TOPIC_COUNT, config.topicCount ?? DEFAULT_TOPIC_COUNT)
		);
		const keywordCount = Math.max(1, config.keywordCount ?? DEFAULT_KEYWORD_COUNT);
		const rawWordCount = config.topicWordCount ?? DEFAULT_TOPIC_WORD_COUNT;
		const topicWordCount = Math.min(
			MAX_TOPIC_WORD_COUNT,
			Math.max(MIN_TOPIC_WORD_COUNT, rawWordCount)
		);
		const similarityThreshold =
			config.topicSimilarityThreshold ?? DEFAULT_TOPIC_SIMILARITY_THRESHOLD;
		const concurrency = Math.max(
			1,
			Math.min(4, config.topicConcurrency ?? DEFAULT_TOPIC_CONCURRENCY)
		);
		const maxSummaryWords = Math.max(
			30,
			Math.min(200, config.maxSummaryWords ?? DEFAULT_MAX_SUMMARY_WORDS)
		);

		return {
			processChunk: async (chunk: string): Promise<AnalysisTopicChunkData> => {
				if (!chunk.trim()) return { topics: [], keywords: [], sections: [] };
				const wantedTopics = clampCountForChunk(chunk, topicCount, 800);
				const wantedKeywords = clampCountForChunk(chunk, keywordCount, 200);

				const [rawTopics, rawKeywords] = await Promise.all([
					wantedTopics > 0
						? extractionUpToHelper(
								chunk,
								wantedTopics,
								buildAnalysisTopicLabelDescription(topicWordCount),
								{
									model: config.model
								}
							).catch(() => [] as string[])
						: Promise.resolve([] as string[]),
					wantedKeywords > 0
						? extractionUpToHelper(chunk, wantedKeywords, ANALYSIS_TOPIC_KEYWORD_DESCRIPTION, {
								model: config.model
							}).catch(() => [] as string[])
						: Promise.resolve([] as string[])
				]);

				let topics = uniqueStrings(
					rawTopics.map((topic) => normalizeTopicLabel(topic, topicWordCount)).filter(Boolean)
				).slice(0, Math.max(1, wantedTopics));

				if (topics.length === 0) {
					const fallback = firstSentenceFallback(chunk, topicWordCount);
					if (fallback) topics = [fallback];
				}

				const sections = (
					await runWithConcurrency(topics, concurrency, async (topic) => {
						try {
							const res = await chatCompletions({
								...SUMMARY_COMPLETION_OPTIONS,
								...config.completionOptions,
								model: config.model,
								n_predict: Math.min(600, maxSummaryWords * 6),
								stream: false,
								messages: [
									{
										role: 'system',
										content: buildAnalysisTopicSummarySystemMessage()
									},
									{
										role: 'user',
										content: `${buildAnalysisTopicSummaryUserMessage(topic, maxSummaryWords)}\n${chunk}\n"""`
									}
								]
							});
							const summary = assistantText(res).trim();
							if (!summary || isNoMention(summary)) return null;
							return { topic, summary };
						} catch (error) {
							console.warn('[analysisTopic] per-topic summary failed, skipping', error);
							return null;
						}
					})
				).filter((section): section is TopicSection => section !== null);

				const keywords = uniqueStrings(rawKeywords).slice(0, Math.max(1, wantedKeywords));

				return {
					topics: topics.map((topic) => ensureTopicPeriod(topic)).filter(Boolean),
					keywords,
					sections: sections.map((section) => ({
						...section,
						topic: ensureTopicPeriod(section.topic)
					}))
				};
			},
			combineChunks: async (results: AnalysisTopicChunkData[]): Promise<AnalysisTopicFinal> => {
				const sections = results
					.flatMap((result) => result.sections)
					.map((section) => ({
						topic: normalizeTopicLabel(section.topic, topicWordCount),
						summary: section.summary.trim()
					}))
					.filter((section) => section.topic && section.summary && !isNoMention(section.summary));
				const keywords = uniqueStrings(results.flatMap((result) => result.keywords));
				const fallbackTopics = uniqueStrings(results.flatMap((result) => result.topics))
					.map((topic) => ensureTopicPeriod(topic))
					.filter(Boolean);

				let clusters: TopicCluster[];
				try {
					if (sections.length === 0) {
						clusters = [];
					} else {
						const response = await createEmbeddings({
							model: EMBEDDING_MODEL,
							input: sections.map(buildEmbeddingInput)
						});
						const embeddings = [...response.data]
							.sort((a, b) => a.index - b.index)
							.map((entry) => entry.embedding);
						clusters =
							embeddings.length === sections.length
								? clusterByEmbedding(sections, embeddings, similarityThreshold)
								: clusterFuzzyByLabel(sections);
					}
				} catch (error) {
					console.warn(
						'[analysisTopic] embeddings unavailable, falling back to fuzzy topic dedupe',
						error
					);
					clusters = clusterFuzzyByLabel(sections);
				}

				const { markdown, sections: mergedSections } = buildBlog(clusters);
				const ensuredSections = mergedSections.map((section) => ({
					...section,
					topic: ensureTopicPeriod(section.topic)
				}));
				return {
					summary: markdown,
					keywords,
					topics:
						ensuredSections.length > 0
							? ensuredSections.map((section) => section.topic)
							: fallbackTopics,
					sections: ensuredSections
				};
			}
		};
	}
};
