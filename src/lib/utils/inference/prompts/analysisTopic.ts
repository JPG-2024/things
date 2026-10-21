export const ANALYSIS_TOPIC_SYSTEM_MESSAGE =
	"You are analyzing video content. Give a very short title and a one-paragraph summary of the whole content, plus the main discussion points with summaries and key terms. In the summaries, use bold (**) to emphasize the most relevant keywords, don't abuse. Return ONLY valid JSON.";

export function buildAnalysisTopicUserMessage(
	topicCount: number,
	keywordCount: number,
	topicWordCount: number,
	langName?: string
): string {
	const langInstruction = langName ? ` Respond in ${langName}.` : '';
	return `Summarize this section in one paragraph, and give that summary a short title (2-8 words). This paragraph is the one summary block for the whole section. Use bold (**) to emphasize the most relevant keywords, don't abuse. Also extract exactly ${topicCount} self explanatory topics, each with a detailed summary (3-5 sentences) covering key points (**), examples, or conclusions, plus ${keywordCount} key terms.${langInstruction} Respond in JSON: { title: string, summary: string, topics: [{label: string, summary: string}], keywords: string[] }`;
}

export const ANALYSIS_TOPICS_SYSTEM_MESSAGE =
	"You are analyzing video content. Extract the main discussion points as self explanatory topics with detailed summaries, plus the key terms discussed. In the summaries, use bold (**) to emphasize the most relevant keywords, don't abuse. Return ONLY valid JSON.";

export const ANALYSIS_SUMMARY_SYSTEM_MESSAGE =
	"You are analyzing video content. Give a very short title and a one-paragraph summary of the whole content. In the summary, use bold (**) to emphasize the most relevant keywords, don't abuse. Return ONLY valid JSON.";

export const ANALYSIS_CONSOLIDATE_SYSTEM_MESSAGE =
	'You rewrite topic labels extracted from different sections of the same content into one clear, final label per section. Return ONLY a JSON array of strings, one label per entry.';

export function buildAnalysisTopicsUserMessage(
	topicCount: number,
	keywordCount: number,
	topicWordCount: number,
	langName?: string
): string {
	const langInstruction = langName ? ` Respond in ${langName}.` : '';
	return `Extract exactly ${topicCount} self explanatory topics from this section, each with a detailed summary (3-5 sentences) covering key points (**), examples, or conclusions. Topic labels must be at most ${topicWordCount} words and understandable without reading the summary. Also extract exactly ${keywordCount} key terms.${langInstruction} Respond in JSON: { topics: [{label: string, summary: string}], keywords: string[] }`;
}

export function buildAnalysisSummaryUserMessage(langName?: string): string {
	const langInstruction = langName ? ` Respond in ${langName}.` : '';
	return `Summarize this section in one paragraph divided by max 8 sentences, and give that summary a short title (2-8 words). This paragraph is the one summary block for the whole section. Use bold (**) to emphasize the most relevant keywords, don't abuse.${langInstruction} Respond in JSON: { title: string, summary: string }`;
}

/** Snippet budget for a cluster summary inside the consolidation prompt. */
const CONSOLIDATE_SNIPPET_CHARS = 240;

export function buildAnalysisConsolidateUserMessage(
	clusters: { label: string; summary: string }[],
	topicWordCount: number,
	langName?: string
): string {
	const langInstruction = langName ? ` Respond in ${langName}.` : '';
	const lines = clusters
		.map((cluster, index) => {
			const summary = cluster.summary.trim();
			const snippet =
				summary.length > CONSOLIDATE_SNIPPET_CHARS
					? `${summary.slice(0, CONSOLIDATE_SNIPPET_CHARS).trimEnd()}…`
					: summary;
			return `${index + 1}. ${cluster.label} — ${snippet}`;
		})
		.join('\n');
	return `These are topic labels extracted independently from different sections of the same content, each with a summary snippet for context. For each entry write one improved final label: self explanatory, specific to the content, at most ${topicWordCount} words, no duplicates. Keep the same order and the same number of entries. Respond ONLY with a JSON array of ${clusters.length} strings, one improved label per entry, positionally matching the list.${langInstruction}\n\n${lines}`;
}
