/**
 * The last two steps of the pipeline: the title and the category.
 *
 * They used to be tasks; now they are plain functions called by the runner.
 */
import { chatCompletions } from '@/lib/utils/inference/chat-completions-provider';
import { assistantAnswerText } from '@/lib/utils/inference/assistant-text';
import { parseTitleText } from '@/lib/utils/inference/finalResponse';
import { TITLE_SYSTEM_MESSAGE, buildTitleUserMessage } from '@/lib/utils/inference/prompts';
import { DEFAULT_TITLE_COMPLETION_OPTIONS } from '@/lib/utils/inference/constants';
import { classifyByEmbedding } from '@/lib/utils/categoryEmbeddings';
import { viewState } from '@/stores/viewStore.svelte';
import type { ArticleWindow } from '@/types/articleAnalysis.types';

/**
 * Generates the title of an article from its summary.
 *
 * Returns `null` when the model produces nothing usable, so the caller can
 * keep the title it already had.
 */
export async function buildArticleTitle(
	summary: string,
	options: { model?: string } = {}
): Promise<string | null> {
	const trimmed = summary.trim();
	if (!trimmed) return null;

	try {
		const response = await chatCompletions({
			...DEFAULT_TITLE_COMPLETION_OPTIONS,
			model: options.model ?? viewState.aiModel,
			stream: false,
			// The summary travels out of the prompt: `chatCompletions` prepends
			// it to the user message and strips it before reaching the server.
			context: trimmed,
			messages: [
				{ role: 'system', content: TITLE_SYSTEM_MESSAGE },
				{ role: 'user', content: buildTitleUserMessage() }
			]
		});

		// Reasoner models answer with their thinking trace before the title;
		// keep only the final response so the header never shows the trace.
		const title = parseTitleText(assistantAnswerText(response));
		return title.trim() || null;
	} catch (error) {
		console.warn('[taskFactories] title generation failed', error);
		return null;
	}
}

/**
 * Classifies an article into category ids by comparing it with the category
 * exemplars.
 *
 * The comparison text is `title + summary`, the same representation the
 * exemplars were fed with.
 */
export async function classifyArticleCategory(params: {
	title: string | null;
	summary: string;
	windows: ArticleWindow[];
}): Promise<string[]> {
	try {
		return await classifyByEmbedding(params.windows, {
			title: params.title,
			summary: params.summary,
			topN: viewState.categoryTopN,
			minSimilarity: viewState.categoryMinSimilarity,
			margin: viewState.categoryMargin
		});
	} catch (error) {
		console.warn('[taskFactories] category classification failed', error);
		return [];
	}
}
