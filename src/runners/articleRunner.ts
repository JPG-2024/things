/**
 * The article runner — the only orchestrator of the app.
 *
 * One linear pipeline per article:
 *
 *   source → raw → article → analysis → title → category → embeddings
 *
 * Every step asks "do I already have this?" before spending it (D24): an
 * existing raw file is not re-fetched, an existing thumbnail is not
 * re-downloaded, an existing analysis is not re-computed.
 */
import { articleState } from '@/stores/articleStore.svelte';
import { viewState } from '@/stores/viewStore.svelte';
import {
	assignCategoriesToArticle,
	getArticleAnalysis,
	getArticleByUrl,
	getArticleCategories,
	saveArticle,
	saveArticleAnalysis
} from '@/stores/webStore';
import {
	analyzeWindows,
	clampWindowLevel,
	WINDOW_DIVISOR_LADDER
} from '@/lib/utils/windowAnalysis';
import { readRawContent, writeRawContent } from '@/lib/utils/rawContent';
import {
	detectSource,
	emptySourceResult,
	fetchRawSource,
	fetchWebSource,
	fetchYouTubeSource,
	type SourceResult
} from '@/runners/articleSources';
import { buildArticleTitle, classifyArticleCategory } from '@/runners/shared/taskFactories';
import { embedAnalysis } from '@/lib/utils/embeddingAnalysis';
import { LANG_NAMES } from '@/constants';
import type { ArticleMode, ArticleWindow } from '@/types/articleAnalysis.types';

/** Options of a run. */
export interface ArticleRunOptions {
	/**
	 * `full` runs the whole pipeline (capture + analysis).
	 * `metadata` only captures the card (title, thumbnail, domain, profile)
	 * and the body when the source gives it for free.
	 */
	mode?: ArticleMode;
	/** Body of the article, for raw sources. */
	rawText?: string;
	/** Forces the pipeline to ignore what is already stored. */
	force?: boolean;
}

/** What a run produced. */
export interface ArticleRunResult {
	url: string;
	mode: ArticleMode;
	/** `true` when the run reused the stored analysis instead of recomputing it. */
	reusedAnalysis: boolean;
	/** The divisor the analysis actually executed, when there was one. */
	divisor: number | null;
}

function languageName(): string | undefined {
	return LANG_NAMES[viewState.language];
}

/**
 * Fetches what the source of an article can give for free.
 *
 * The body is only fetched when it is not already stored: an existing raw
 * file means the article does not have to be downloaded again (D24).
 */
async function collectSource(
	url: string,
	options: {
		mode: ArticleMode;
		force: boolean;
		rawText?: string;
		existingThumbnail?: string | null;
	}
): Promise<SourceResult> {
	const source = detectSource(url);

	if (source === 'raw') {
		return fetchRawSource(options.rawText ?? '');
	}

	// A stored raw file means the body is already here: no re-fetch.
	const storedText = options.force ? null : await readRawContent(url);

	if (source === 'youtube') {
		return fetchYouTubeSource(url, {
			includeTranscript: options.mode === 'full',
			storedText,
			existingThumbnail: options.existingThumbnail
		});
	}

	// The body is reused. The thumbnail is only downloaded when it is missing.
	if (storedText && options.existingThumbnail) {
		return { ...emptySourceResult(), text: storedText };
	}

	return fetchWebSource(url);
}

/**
 * Runs the pipeline for one article.
 *
 * The run always persists what it produces, but it only writes to the store
 * while its url is still the one on screen (D17): a run that finishes after
 * the user navigated away must not repaint the current article.
 */
export async function runArticle(
	url: string,
	options: ArticleRunOptions = {}
): Promise<ArticleRunResult> {
	const mode: ArticleMode = options.mode ?? 'full';
	const force = options.force === true;

	const existing = await getArticleByUrl(url);
	const existingAnalysis = force ? null : await getArticleAnalysis(url);

	// --- 1. SOURCE -------------------------------------------------------
	// Pipeline progress only mirrors on the article on screen: a background
	// run must not touch the state of a different open article.
	if (articleState.isCurrent(url)) {
		articleState.setStep('source');
		articleState.setStatus('running');
	}

	const source = await collectSource(url, {
		mode,
		force,
		rawText: options.rawText,
		existingThumbnail: existing?.thumbnail ?? null
	});

	const text = source.text;
	const thumbnail = source.thumbnail ?? existing?.thumbnail ?? null;
	const mediaDirectory = source.mediaDirectory ?? existing?.mediaDirectory ?? null;
	const profile = source.profile ?? existing?.profile ?? null;
	let title = source.title ?? existing?.title ?? null;
	const date = source.date ?? existing?.date ?? null;

	// --- 2. RAW ----------------------------------------------------------
	// The body is only stored when the source gave it for free.
	if (articleState.isCurrent(url)) {
		articleState.setStep('raw');
	}
	if (text) {
		await writeRawContent(url, text);
	}

	// --- 3. ARTICLE ------------------------------------------------------
	if (articleState.isCurrent(url)) {
		articleState.setStep('article');
	}
	await saveArticle(url, {
		title,
		thumbnail,
		directory: mediaDirectory,
		profile,
		date,
		mode: mode === 'metadata' ? 'metadata' : undefined
	});

	// A `metadata` run stops here: the article is captured and pending.
	if (mode === 'metadata') {
		if (articleState.isCurrent(url)) {
			articleState.setStatus('done');
			articleState.setStep(null);
		}
		return { url, mode, reusedAnalysis: false, divisor: existingAnalysis?.divisor ?? null };
	}

	// --- 4. ANALYSIS -----------------------------------------------------
	let windows: ArticleWindow[] = existingAnalysis?.windows ?? [];
	let summary = existingAnalysis?.summary ?? '';
	let divisor = existingAnalysis?.divisor ?? null;
	let reusedAnalysis = false;

	const hasUsableAnalysis =
		!force && existingAnalysis !== null && existingAnalysis.windows.length > 0;

	if (hasUsableAnalysis) {
		reusedAnalysis = true;
	} else {
		if (articleState.isCurrent(url)) {
			articleState.setStep('analysis');
			articleState.setStatus('running');
		}

		const body = text ?? (await readRawContent(url)) ?? '';
		if (!body.trim()) {
			throw new Error(`Article "${url}" has no body to analyse`);
		}

		const level = clampWindowLevel(viewState.windowLevel);
		const requestedDivisor = WINDOW_DIVISOR_LADDER[level];
		// Web articles split by markdown headings: no knob, no clamp.
		const splitByHeaders = detectSource(url) === 'web';

		const analysis = await analyzeWindows(body, {
			divisor: splitByHeaders ? null : requestedDivisor,
			splitByHeaders,
			model: viewState.aiModel,
			languageName: languageName(),
			onWindow: (window, index, total) => {
				if (!articleState.isCurrent(url)) return;
				const current = articleState.currentArticle.analysis?.windows ?? [];
				articleState.setAnalysis({
					windows: [...current, window],
					summary: articleState.currentArticle.analysis?.summary ?? '',
					divisor: articleState.currentArticle.analysis?.divisor ?? null
				});
				articleState.setProgress({ done: index + 1, total });
			}
		});

		windows = analysis.windows;
		summary = analysis.summary;
		divisor = analysis.divisor;

		await saveArticleAnalysis({ url, summary, divisor, windows });
	}

	if (articleState.isCurrent(url)) {
		articleState.setAnalysis({ windows, summary, divisor });
	}

	// --- 5. TITLE --------------------------------------------------------
	if (articleState.isCurrent(url)) {
		articleState.setStep('title');
	}
	// A reused analysis already has its title stored: regenerating it would
	// spend an LLM call for nothing.
	if (!reusedAnalysis || !title) {
		const generatedTitle = await buildArticleTitle(summary);
		if (generatedTitle) {
			title = generatedTitle;
			await saveArticle(url, { title });
			if (articleState.isCurrent(url)) {
				articleState.setTitle(generatedTitle);
			}
		}
	}

	// --- 6. CATEGORY -----------------------------------------------------
	if (articleState.isCurrent(url)) {
		articleState.setStep('category');
	}
	// The database is the source of truth for the categories of an article.
	let categories = await getArticleCategories(url);

	// The category is only auto-classified when the article has none (D5).
	if (categories.length === 0) {
		const categoryIds = await classifyArticleCategory({
			title,
			summary,
			windows
		});
		if (categoryIds.length > 0) {
			await assignCategoriesToArticle({ articleUrl: url, categoryIds });
			categories = categoryIds;
			if (articleState.isCurrent(url)) {
				articleState.setCategories(categoryIds);
			}
		}
	}

	// --- 7. EMBEDDINGS ---------------------------------------------------
	if (viewState.embeddingsEnabled) {
		if (articleState.isCurrent(url)) {
			articleState.setStep('embeddings');
		}
		try {
			await embedAnalysis({ url, windows, categories });
		} catch (error) {
			console.error(`[articleRunner] embeddings failed for "${url}"`, error);
		}
	}

	if (articleState.isCurrent(url)) {
		articleState.setStatus('done');
		articleState.setStep(null);
	}

	return { url, mode, reusedAnalysis, divisor };
}

/**
 * Re-runs only the analysis of an article: the windows and the title.
 *
 * The body is read from the raw file (no re-fetch) and the category is never
 * overwritten: a rerun of the analysis must not move the article to another
 * category.
 */
export async function rerunArticleAnalysis(
	url: string,
	options: { windowLevel?: number } = {}
): Promise<ArticleRunResult> {
	const body = (await readRawContent(url)) ?? '';
	if (!body.trim()) {
		throw new Error(`Article "${url}" has no body to analyse`);
	}

	const level = clampWindowLevel(options.windowLevel ?? viewState.windowLevel);
	const requestedDivisor = WINDOW_DIVISOR_LADDER[level];
	const splitByHeaders = detectSource(url) === 'web';

	if (articleState.isCurrent(url)) {
		articleState.setStep('analysis');
		articleState.setStatus('running');
	}

	const analysis = await analyzeWindows(body, {
		divisor: splitByHeaders ? null : requestedDivisor,
		splitByHeaders,
		model: viewState.aiModel,
		languageName: languageName(),
		onWindow: (window, index, total) => {
			if (!articleState.isCurrent(url)) return;
			const current = articleState.currentArticle.analysis?.windows ?? [];
			articleState.setAnalysis({
				windows: [...current, window],
				summary: articleState.currentArticle.analysis?.summary ?? '',
				divisor: articleState.currentArticle.analysis?.divisor ?? null
			});
			articleState.setProgress({ done: index + 1, total });
		}
	});

	await saveArticleAnalysis({
		url,
		summary: analysis.summary,
		divisor: analysis.divisor,
		windows: analysis.windows
	});

	if (articleState.isCurrent(url)) {
		articleState.setAnalysis({
			windows: analysis.windows,
			summary: analysis.summary,
			divisor: analysis.divisor
		});
	}

	// The title is regenerated from the new summary; the category is left
	// untouched on purpose.
	if (articleState.isCurrent(url)) {
		articleState.setStep('title');
	}
	const generatedTitle = await buildArticleTitle(analysis.summary);
	if (generatedTitle) {
		await saveArticle(url, { title: generatedTitle });
		if (articleState.isCurrent(url)) {
			articleState.setTitle(generatedTitle);
		}
	}

	if (articleState.isCurrent(url)) {
		articleState.setStatus('done');
		articleState.setStep(null);
	}

	return { url, mode: 'full', reusedAnalysis: false, divisor: analysis.divisor };
}
