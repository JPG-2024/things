import { chatCompletions } from '@/lib/utils/inference/chat-completions-provider';
import { assistantAnswerText } from '@/lib/utils/inference/assistant-text';
import { createEmbeddings } from '@/lib/utils/inference/llama-completions';
import { EMBEDDING_MODEL } from '@/lib/utils/inference/constants';
import { analysisSummaryGbnf, analysisTopicsGbnf, stringArrayGbnf } from '@/lib/utils/gbnf';
import {
	ANALYSIS_CONSOLIDATE_SYSTEM_MESSAGE,
	ANALYSIS_SUMMARY_SYSTEM_MESSAGE,
	ANALYSIS_TOPICS_SYSTEM_MESSAGE,
	buildAnalysisConsolidateUserMessage,
	buildAnalysisSummaryUserMessage,
	buildAnalysisTopicsUserMessage
} from '@/lib/utils/inference/prompts';
import { viewState } from '@/stores/viewStore.svelte';
import { LANG_NAMES } from '@/constants';
import { buildWindowBlocks, mergeSummaries, uniqueStrings } from './analysisParse';
import {
	parseSplitConsolidateResponse,
	parseSplitSummaryResponse,
	parseSplitTopicsResponse
} from './analysisTopicSplitParse';
import type { SplitSummaryChunkData, SplitTopicsChunkData } from './analysisTopicSplitParse';
import {
	DEFAULT_KEYWORD_COUNT,
	DEFAULT_TOPIC_COUNT,
	DEFAULT_TOPIC_WORD_COUNT,
	MAX_TOPIC_COUNT,
	MIN_TOPIC_COUNT,
	TOPIC_SIMILARITY_THRESHOLD,
	clusterByEmbedding,
	clusterByLabel,
	normalizeTopicLabel
} from './analysisTopic';
import type { TopicCluster } from './analysisTopic';
import type {
	AnalysisTopicChunkData,
	AnalysisTopicFinal,
	ChunkProcessorConfig,
	ProcessorDef,
	TopicSection
} from './types';

/**
 * Split variant of `analysisTopic`: each window runs two focused LLM calls
 * (topics+keywords, then title+summary) instead of one mixed call, and
 * `combineChunks` consolidates the clustered topic labels with one extra
 * call per document. The chunk/final data shapes are identical to the
 * single-call processor, so both stay swappable at the registry.
 */

type ClusterCandidate = { label: string; summary: string };

function langName(): string | undefined {
	return LANG_NAMES[viewState.language];
}

async function extractTopicsAndKeywords(
	chunk: string,
	config: ChunkProcessorConfig,
	topicCount: number,
	keywordCount: number,
	topicWordCount: number
): Promise<SplitTopicsChunkData> {
	const response = await chatCompletions({
		...config.completionOptions,
		model: config.model,
		stream: false,
		// Ask reasoner models for a short reasoning pass instead of forcing it
		// off: thinking templates may ignore `enabled: false`, answer inside
		// the thinking trace, and close the turn with an empty `content`.
		// `assistantAnswerText` falls back to `reasoning_content` for that case.
		reasoning_effort: 'low',
		// Only constrains the llama-server path; OpenRouter strips `grammar`
		// (LLAMA_SPECIFIC_FIELDS) and relies on the JSON prompt instruction.
		grammar: analysisTopicsGbnf(topicCount, keywordCount),
		messages: [
			{ role: 'system', content: ANALYSIS_TOPICS_SYSTEM_MESSAGE },
			{
				role: 'user',
				content:
					buildAnalysisTopicsUserMessage(topicCount, keywordCount, topicWordCount, langName()) +
					'\n\n' +
					chunk
			}
		]
	});

	return parseSplitTopicsResponse(assistantAnswerText(response));
}

async function extractWindowSummary(
	chunk: string,
	config: ChunkProcessorConfig
): Promise<SplitSummaryChunkData> {
	const response = await chatCompletions({
		...config.completionOptions,
		model: config.model,
		stream: false,
		reasoning_effort: 'low',
		grammar: analysisSummaryGbnf(),
		messages: [
			{ role: 'system', content: ANALYSIS_SUMMARY_SYSTEM_MESSAGE },
			{
				role: 'user',
				content: buildAnalysisSummaryUserMessage(langName()) + '\n\n' + chunk
			}
		]
	});

	return parseSplitSummaryResponse(assistantAnswerText(response));
}

/**
 * One consolidation call per document: rewrites the clustered topic labels
 * into final ones. Any failure (transport or unusable output) keeps the
 * existing clustered labels, mirroring the embeddings fallback.
 */
async function consolidateClusterLabels(
	clusters: TopicCluster[],
	config: ChunkProcessorConfig,
	topicWordCount: number
): Promise<TopicSection[]> {
	const fallback: TopicSection[] = clusters.map((cluster) => ({
		topic: cluster.label,
		summary: mergeSummaries(cluster.summaries)
	}));
	if (clusters.length === 0) return [];

	try {
		const candidates: ClusterCandidate[] = clusters.map((cluster) => ({
			label: cluster.label,
			summary: mergeSummaries(cluster.summaries)
		}));
		const response = await chatCompletions({
			...config.completionOptions,
			model: config.model,
			stream: false,
			reasoning_effort: 'low',
			grammar: stringArrayGbnf(clusters.length),
			messages: [
				{ role: 'system', content: ANALYSIS_CONSOLIDATE_SYSTEM_MESSAGE },
				{
					role: 'user',
					content: buildAnalysisConsolidateUserMessage(candidates, topicWordCount, langName())
				}
			]
		});
		const labels = parseSplitConsolidateResponse(assistantAnswerText(response), clusters.length);
		if (!labels) return fallback;

		return clusters.map((cluster, index) => {
			const improved = labels[index];
			const label = normalizeTopicLabel(improved || cluster.label, topicWordCount);
			return {
				topic: label || cluster.label,
				summary: mergeSummaries(cluster.summaries)
			};
		});
	} catch (error) {
		console.warn(
			'[analysisTopicSplit] label consolidation unavailable, keeping clustered labels',
			error
		);
		return fallback;
	}
}

async function clusterSections(sections: TopicSection[]): Promise<TopicCluster[]> {
	try {
		if (sections.length === 0) return [];
		const response = await createEmbeddings({
			model: EMBEDDING_MODEL,
			input: sections.map((section) => section.topic)
		});
		const embeddings = [...response.data]
			.sort((a, b) => a.index - b.index)
			.map((entry) => entry.embedding);
		return embeddings.length === sections.length
			? clusterByEmbedding(sections, embeddings, TOPIC_SIMILARITY_THRESHOLD)
			: clusterByLabel(sections);
	} catch (error) {
		console.warn(
			'[analysisTopicSplit] embeddings unavailable, falling back to exact topic dedupe',
			error
		);
		return clusterByLabel(sections);
	}
}

export const analysisTopicSplitProcessor: ProcessorDef = {
	type: 'analysisTopic',
	defaults: {
		userMessage:
			'Extract the main topics and keywords, summarize the window, and consolidate the topic labels.'
	},
	build: (config) => {
		// The depth table can express any per-window topic count; clamp it so
		// both the prompt and the fixed-count grammar stay inside the cap.
		const topicCount = Math.min(
			MAX_TOPIC_COUNT,
			Math.max(MIN_TOPIC_COUNT, config.topicCount ?? DEFAULT_TOPIC_COUNT)
		);
		const keywordCount = config.keywordCount ?? DEFAULT_KEYWORD_COUNT;
		const topicWordCount = config.topicWordCount ?? DEFAULT_TOPIC_WORD_COUNT;

		return {
			// One attempt per half-chunk, run in parallel. Transport errors
			// (unreachable server, context-size, abort) propagate so the runner
			// can re-chunk or stop; only unusable LLM output degrades that half
			// to its empty shape, leaving the other half intact.
			processChunk: async (chunk: string): Promise<AnalysisTopicChunkData> => {
				const [topicsPart, summaryPart] = await Promise.all([
					extractTopicsAndKeywords(chunk, config, topicCount, keywordCount, topicWordCount),
					extractWindowSummary(chunk, config)
				]);
				return {
					title: summaryPart.title,
					summary: summaryPart.summary,
					topics: topicsPart.topics.map((section) => section.topic),
					keywords: topicsPart.keywords,
					sections: topicsPart.topics
				};
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

				const clusters = await clusterSections(sections);
				const mergedSections = await consolidateClusterLabels(clusters, config, topicWordCount);

				return {
					// One block per window (`## title` + paragraph), same shape as
					// the single-call processor; each window falls back on its own
					// to stitched topic summaries when title/summary are missing.
					summary: buildWindowBlocks(results),
					keywords,
					topics: mergedSections.map((section) => section.topic),
					sections: mergedSections
				};
			}
		};
	}
};
