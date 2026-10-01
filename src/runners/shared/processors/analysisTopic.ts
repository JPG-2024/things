import { chatCompletions } from '@/lib/utils/inference/chat-completions-provider';
import { assistantText } from '@/lib/utils/inference/assistant-text';
import { createEmbeddings } from '@/lib/utils/inference/llama-completions';
import { extractionHelper } from '@/lib/utils/inference/extraction-helper';
import { EMBEDDING_MODEL, SUMMARY_COMPLETION_OPTIONS } from '@/lib/utils/inference/constants';
import {
	ANALYSIS_TOPIC_KEYWORD_DESCRIPTION,
	buildAnalysisTopicSummarySystemMessage,
	buildAnalysisTopicSummaryUserMessage,
	buildAnalysisTopicLabelDescription
} from '@/lib/utils/inference/prompts';
import { viewState } from '@/stores/viewStore.svelte';
import { LANG_NAMES } from '@/constants';
import type {
	AnalysisTopicChunkData,
	AnalysisTopicFinal,
	ProcessorDef,
	TopicSection
} from './types';

export const DEFAULT_TOPIC_COUNT = 1;
export const DEFAULT_KEYWORD_COUNT = 4;
export const DEFAULT_TOPIC_WORD_COUNT = 15;
export const MIN_TOPIC_COUNT = 1;
export const MAX_TOPIC_COUNT = 10;
export const MIN_TOPIC_WORD_COUNT = 1;
export const MAX_TOPIC_WORD_COUNT = 10;
const TOPIC_SIMILARITY_THRESHOLD = 0.85;

function uniqueStrings(values: string[], key?: (value: string) => string): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const raw of values) {
		const value = raw.trim();
		if (!value) continue;
		const lookup = key ? key(value) : value.toLowerCase();
		if (seen.has(lookup)) continue;
		seen.add(lookup);
		result.push(value);
	}
	return result;
}

function cosineSimilarity(a: number[], b: number[]): number {
	let dot = 0;
	let normA = 0;
	let normB = 0;
	const length = Math.min(a.length, b.length);
	for (let i = 0; i < length; i++) {
		dot += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}
	if (normA === 0 || normB === 0) return 0;
	return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

type TopicCluster = {
	label: string;
	embedding: number[];
	summaries: string[];
};

function clusterByEmbedding(
	sections: TopicSection[],
	embeddings: number[][],
	threshold: number
): TopicCluster[] {
	const clusters: TopicCluster[] = [];
	for (let i = 0; i < sections.length; i++) {
		const section = sections[i];
		const embedding = embeddings[i] ?? [];
		let target: TopicCluster | null = null;
		let bestScore = threshold;
		for (const cluster of clusters) {
			const score = cosineSimilarity(embedding, cluster.embedding);
			if (score >= bestScore) {
				bestScore = score;
				target = cluster;
			}
		}
		if (target) {
			target.summaries.push(section.summary);
		} else {
			clusters.push({ label: section.topic, embedding, summaries: [section.summary] });
		}
	}
	return clusters;
}

function clusterByLabel(sections: TopicSection[]): TopicCluster[] {
	const clusters: TopicCluster[] = [];
	const byLabel = new Map<string, TopicCluster>();
	for (const section of sections) {
		const label = section.topic.trim();
		const key = label.toLowerCase();
		let cluster = byLabel.get(key);
		if (!cluster) {
			cluster = { label, embedding: [], summaries: [] };
			byLabel.set(key, cluster);
			clusters.push(cluster);
		}
		cluster.summaries.push(section.summary);
	}
	return clusters;
}

/**
 * Shrinks a raw topic label to a short, sentence-safe form.
 *
 * The LLM is asked for short labels, but nothing guarantees it, so this is the
 * deterministic backstop: strip leading bullets/quotes, keep only the first
 * clause, cap words and characters, and end with a single period.
 */
function normalizeTopicLabel(raw: string, maxWords: number): string {
	let label = raw
		.trim()
		.replace(/^[-*•\d.)\s]+/, '')
		.replace(/^["'`]+|["'`]+$/g, '')
		.replace(/\s+/g, ' ')
		.replace(/[.;:!?,]+$/, '');

	label = label.split(/\s+[–—-]\s+|\s*:\s+/)[0].trim();

	const words = label.split(' ');
	if (words.length > maxWords) {
		label = words.slice(0, maxWords).join(' ');
	}

	// Characters are a language-safe backstop (CJK has no word spaces).
	const maxChars = Math.max(24, maxWords * 10);
	if (label.length > maxChars) {
		const clipped = label.slice(0, maxChars);
		const lastSpace = clipped.lastIndexOf(' ');
		label = (lastSpace > 0 ? clipped.slice(0, lastSpace) : clipped).trim();
	}

	return label ? `${label}.` : '';
}

function mergeSummaries(summaries: string[]): string {
	const unique = uniqueStrings(summaries, (value) => value);
	return unique
		.filter((summary) => !unique.some((other) => other !== summary && other.includes(summary)))
		.join('\n\n');
}

function buildBlog(clusters: TopicCluster[]): { markdown: string; sections: TopicSection[] } {
	const sections: TopicSection[] = clusters.map((cluster) => ({
		topic: cluster.label,
		summary: mergeSummaries(cluster.summaries)
	}));
	const markdown = sections
		.filter((section) => section.summary)
		.map((section) => `## ${section.topic}\n\n${section.summary}`)
		.join('\n\n');
	return { markdown, sections };
}

export const analysisTopicProcessor: ProcessorDef = {
	type: 'analysisTopic',
	defaults: {
		userMessage: 'Extract the main topics, summarize each one and extract keywords.'
	},
	build: (config) => {
		const topicCount = config.topicCount ?? DEFAULT_TOPIC_COUNT;
		const keywordCount = config.keywordCount ?? DEFAULT_KEYWORD_COUNT;
		const topicWordCount = config.topicWordCount ?? DEFAULT_TOPIC_WORD_COUNT;

		return {
			processChunk: async (chunk: string): Promise<AnalysisTopicChunkData> => {
				const rawTopics = await extractionHelper(
					chunk,
					topicCount,
					buildAnalysisTopicLabelDescription(topicWordCount),
					{ model: config.model }
				);
				const topics = uniqueStrings(
					rawTopics.map((topic) => normalizeTopicLabel(topic, topicWordCount)).filter(Boolean)
				);

				const langName = LANG_NAMES[viewState.language];
				const sections: TopicSection[] = await Promise.all(
					topics.map(async (topic) => {
						const res = await chatCompletions({
							...SUMMARY_COMPLETION_OPTIONS,
							...config.completionOptions,
							model: config.model,
							stream: false,
							messages: [
								{
									role: 'system',
									content: buildAnalysisTopicSummarySystemMessage(langName)
								},
								{
									role: 'user',
									content: `${buildAnalysisTopicSummaryUserMessage(topic)}:\n\n${chunk}`
								}
							]
						});
						return { topic, summary: assistantText(res).trim() };
					})
				);

				const keywords = await extractionHelper(
					chunk,
					keywordCount,
					ANALYSIS_TOPIC_KEYWORD_DESCRIPTION,
					{ model: config.model }
				);

				return { topics, keywords: uniqueStrings(keywords), sections };
			},
			combineChunks: async (results: AnalysisTopicChunkData[]): Promise<AnalysisTopicFinal> => {
				const sections = results
					.flatMap((result) => result.sections)
					.map((section) => ({
						...section,
						topic: normalizeTopicLabel(section.topic, topicWordCount)
					}))
					.filter((section) => section.topic);
				const keywords = uniqueStrings(results.flatMap((result) => result.keywords));

				let clusters: TopicCluster[];
				try {
					if (sections.length === 0) {
						clusters = [];
					} else {
						const response = await createEmbeddings({
							model: EMBEDDING_MODEL,
							input: sections.map((section) => section.topic)
						});
						const embeddings = [...response.data]
							.sort((a, b) => a.index - b.index)
							.map((entry) => entry.embedding);
						clusters =
							embeddings.length === sections.length
								? clusterByEmbedding(sections, embeddings, TOPIC_SIMILARITY_THRESHOLD)
								: clusterByLabel(sections);
					}
				} catch (error) {
					console.warn(
						'[analysisTopic] embeddings unavailable, falling back to exact topic dedupe',
						error
					);
					clusters = clusterByLabel(sections);
				}

				const { markdown, sections: mergedSections } = buildBlog(clusters);
				return {
					summary: markdown,
					keywords,
					topics: mergedSections.map((section) => section.topic),
					sections: mergedSections
				};
			}
		};
	}
};
