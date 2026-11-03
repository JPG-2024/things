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
import {
	assignCategoriesToArticle,
	getArticleCategories,
	getProfileCategories
} from '@/stores/webStore';
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
 *
 * Throws when the embedding classifier fails, so the caller can decide whether
 * to keep going with the profile categories only.
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
		throw new Error('Category classification failed', { cause: error });
	}
}

function dedupeIds(ids: string[]): string[] {
	return ids.filter((id, i, arr) => arr.indexOf(id) === i);
}

async function readProfileCategories(profileId?: string | null): Promise<string[]> {
	if (!profileId) return [];
	try {
		return await getProfileCategories(profileId);
	} catch (error) {
		throw new Error(`Failed to read categories of profile "${profileId}"`, { cause: error });
	}
}

/** Result of resolving the categories of an article. */
export interface ArticleCategoryResolution {
	/** Union of the profile and classifier ids, deduplicated (profile first). */
	categoryIds: string[];
	/** Ids contributed by the profile (channel or domain). */
	profileIds: string[];
	/** Ids contributed by the embedding classifier. */
	classifiedIds: string[];
}

/**
 * Resolves the categories of an article: the categories linked to its profile
 * (channel or domain) first, then the embedding classifier, deduplicated with
 * the profile ids first.
 *
 * The profile ids are always applied. If the classifier fails afterwards, the
 * profile ids are already persisted and the error is rethrown so the caller can
 * surface it.
 */
export async function resolveArticleCategories(params: {
	url: string;
	title: string | null;
	summary: string;
	windows: ArticleWindow[];
	profileId?: string | null;
}): Promise<ArticleCategoryResolution> {
	const profileIds = await readProfileCategories(params.profileId);

	let classifiedIds: string[] = [];
	let classificationError: unknown = null;
	try {
		classifiedIds = await classifyArticleCategory(params);
	} catch (error) {
		classificationError = error;
	}

	const categoryIds = dedupeIds([...profileIds, ...classifiedIds]);
	if (categoryIds.length > 0) {
		try {
			await assignCategoriesToArticle({ articleUrl: params.url, categoryIds });
		} catch (error) {
			throw new Error(`Failed to persist categories for "${params.url}"`, { cause: error });
		}
	}

	if (classificationError) {
		throw new Error(`Category classification failed for "${params.url}"`, {
			cause: classificationError
		});
	}

	return { categoryIds, profileIds, classifiedIds };
}

/** Result of the open/failure-path profile fallback. */
export interface InheritedProfileCategories {
	categoryIds: string[];
	/** `true` when the article had no categories and the profile filled them. */
	applied: boolean;
}

/**
 * Copies the categories linked to a profile onto an article that has none.
 *
 * Used by the open path and by the runner's failure path: a run that dies
 * before the category step (missing transcript, failed analysis) still leaves
 * the article tagged with its profile's categories. Best effort: failures are
 * logged and never propagated, so they cannot mask the original run error.
 */
export async function inheritProfileCategoriesIfEmpty(
	url: string,
	profileId: string | null | undefined
): Promise<InheritedProfileCategories> {
	if (!profileId) return { categoryIds: [], applied: false };

	const current = await getArticleCategories(url);
	if (current.length > 0) return { categoryIds: current, applied: false };

	let inherited: string[];
	try {
		inherited = await getProfileCategories(profileId);
	} catch (error) {
		console.error(`[taskFactories] failed to read profile categories for "${profileId}"`, error);
		return { categoryIds: [], applied: false };
	}
	if (inherited.length === 0) return { categoryIds: [], applied: false };

	try {
		await assignCategoriesToArticle({ articleUrl: url, categoryIds: inherited });
	} catch (error) {
		console.error(`[taskFactories] failed to inherit profile categories for "${url}"`, error);
		return { categoryIds: [], applied: false };
	}
	return { categoryIds: inherited, applied: true };
}
