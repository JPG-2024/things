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
	WINDOW_DIVISOR_LADDER,
	type AnalyzeWindowsOptions
} from '@/lib/utils/windowAnalysis';
import { readRawContent, writeRawContent } from '@/lib/utils/rawContent';
import {
	detectSource,
	emptySourceResult,
	fetchRawSource,
	fetchWebSource,
	fetchYouTubeSource,
	type SourceFetch,
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
	/**
	 * Channel already resolved by the caller (a profile refresh scrapes it
	 * once up front). The run fills the card from it instead of asking the
	 * scraper again for every video it captures.
	 */
	profile?: KnownProfile;
	/**
	 * Title the caller already knows (the channel scrape carries it). The
	 * run fills the card from it instead of waiting for the LLM title of a
	 * later `full` run.
	 */
	title?: string;
}

/**
 * A channel the caller already knows, in the shape the source step writes
 * into the article row. `id` carries the caller's normalization (the same
 * one `resolveYouTubeProfile` applies to a scraped id).
 */
export interface KnownProfile {
	id: string;
	profilePath: string | null;
	/** Media file name of the channel picture, downloaded by the caller. */
	profilePicture: string | null;
	/** Resolved src of `profilePicture`, for immediate rendering. */
	profilePictureSrc: string | null;
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
 * Streams the windows of one analysis attempt into the store.
 *
 * `onAttempt` owns the reset: an attempt (a re-run, a forced run, or a retry
 * after a context overflow) starts from an empty buffer, so the list on screen
 * never shows two generations of windows at once. The screen therefore shows
 * `0/total` until the first window lands, and `n/total` stays truthful.
 *
 * Every write is guarded by `isCurrent(url)`: a background run must not
 * repaint the article on screen (D17).
 */
function analysisStream(url: string): Pick<AnalyzeWindowsOptions, 'onAttempt' | 'onWindow'> {
	return {
		onAttempt: (total) => {
			if (!articleState.isCurrent(url)) return;
			articleState.setAnalysis({ windows: [], summary: '', divisor: null });
			articleState.setProgress({ done: 0, total });
		},
		onWindow: (window, index, total) => {
			if (!articleState.isCurrent(url)) return;
			const current = articleState.currentArticle.analysis?.windows ?? [];
			// The summary and the divisor only exist once the whole attempt is
			// finished: the locals of this run are what gets persisted.
			articleState.setAnalysis({ windows: [...current, window], summary: '', divisor: null });
			articleState.setProgress({ done: index + 1, total });
		}
	};
}

/**
 * Fetches what the source of an article can give for free.
 *
 * The body is only fetched when it is not already stored: an existing raw
 * file means the article does not have to be downloaded again (D24).
 *
 * The card (thumbnail, favicon, channel) comes back as `decoration`: it is
 * already in flight when this resolves, but the caller does not have to wait
 * for it, so the analysis only queues behind the body.
 */
async function collectSource(
	url: string,
	options: {
		mode: ArticleMode;
		force: boolean;
		rawText?: string;
		existingThumbnail?: string | null;
		profile?: KnownProfile;
		title?: string;
		/** Forwarded to the YouTube source: paints the thumbnail on download. */
		onThumbnail?: (thumbnail: string, thumbnailSrc: string) => void;
	}
): Promise<SourceFetch> {
	const source = detectSource(url);

	if (source === 'raw') {
		return {
			source: await fetchRawSource(options.rawText ?? ''),
			decoration: Promise.resolve<Partial<SourceResult>>({})
		};
	}

	// A stored raw file means the body is already here: no re-fetch.
	const storedText = options.force ? null : await readRawContent(url);

	if (source === 'youtube') {
		return fetchYouTubeSource(url, {
			includeTranscript: options.mode === 'full',
			storedText,
			existingThumbnail: options.existingThumbnail,
			profile: options.profile,
			title: options.title,
			onThumbnail: options.onThumbnail
		});
	}

	// The body is reused. The thumbnail is only downloaded when it is missing.
	if (storedText && options.existingThumbnail) {
		return {
			source: { ...emptySourceResult(), text: storedText },
			decoration: Promise.resolve({})
		};
	}

	return fetchWebSource(url);
}

/**
 * Runs the pipeline for one article.
 *
 * The run always persists what it produces, but it only writes to the store
 * while its url is still the one on screen (D17): a run that finishes after
 * the user navigated away must not repaint the current article.
 *
 * The card (thumbnail, favicon, channel) is decoration: it is fetched in
 * parallel with the body, painted as soon as it lands and persisted when the
 * run ends, so the analysis never queues behind it.
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

	const { source, decoration } = await collectSource(url, {
		mode,
		force,
		rawText: options.rawText,
		existingThumbnail: existing?.thumbnail ?? null,
		profile: options.profile,
		// The file exists as soon as it is downloaded: painting it here keeps
		// the media column from waiting for the rest of the card (channel
		// scrape), which is the slowest part.
		onThumbnail: (thumbnail, thumbnailSrc) => {
			if (!articleState.isCurrent(url)) return;
			articleState.setThumbnail(thumbnail, thumbnailSrc);
		}
	});

	// The card decoration is already in flight when the body arrives and is
	// painted as soon as it lands: the analysis only needs `source.text`, so
	// it never queues behind a thumbnail, a favicon or a channel scrape. The
	// row itself is written by the `finally` below, which also covers the runs
	// that fail, so the card is persisted exactly once and in order.
	const decorationTask = decoration
		.then((partial) => {
			if (articleState.isCurrent(url)) {
				if (partial.thumbnail && partial.thumbnailSrc) {
					articleState.setThumbnail(partial.thumbnail, partial.thumbnailSrc);
				}
				if (partial.profilePictureSrc) {
					articleState.setProfile(partial.profile ?? source.profile, partial.profilePictureSrc);
				}
			}
			return partial;
		})
		.catch((error): Partial<SourceResult> => {
			console.warn(`[articleRunner] card decoration failed for "${url}"`, error);
			return {};
		});

	const text = source.text;
	const thumbnail = source.thumbnail ?? existing?.thumbnail ?? null;
	const thumbnailSrc = source.thumbnailSrc ?? existing?.thumbnailSrc ?? null;
	const mediaDirectory = source.mediaDirectory ?? existing?.mediaDirectory ?? null;
	const profile = source.profile ?? existing?.profile ?? null;
	const profilePictureSrc = source.profilePictureSrc ?? existing?.profilePictureSrc ?? null;
	let title = options.title ?? source.title ?? existing?.title ?? null;
	const date = source.date ?? existing?.date ?? null;

	// What the card already had is painted now; the pieces still being
	// downloaded are painted by `decorationTask`. Guarded like every other
	// store write: a background run must not repaint another article (D17).
	if (articleState.isCurrent(url)) {
		articleState.setThumbnail(thumbnail, thumbnailSrc);
		if (profilePictureSrc !== null) {
			articleState.setProfile(profile, profilePictureSrc);
		}
	}

	try {
		// --- 2. RAW ------------------------------------------------------
		// The body is only stored when the source gave it for free.
		if (articleState.isCurrent(url)) {
			articleState.setStep('raw');
		}
		if (text) {
			await writeRawContent(url, text);
		}

		// --- 3. ARTICLE --------------------------------------------------
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

		// --- 4. ANALYSIS -------------------------------------------------
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
				// The article row was already saved with its metadata; the error
				// only tells why there is no analysis behind it.
				if (detectSource(url) === 'youtube') {
					throw new Error(`No captions or transcript available for "${url}"`);
				}
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
				...analysisStream(url)
			});

			windows = analysis.windows;
			summary = analysis.summary;
			divisor = analysis.divisor;

			await saveArticleAnalysis({ url, summary, divisor, windows });
		}

		if (articleState.isCurrent(url)) {
			articleState.setAnalysis({ windows, summary, divisor });
		}

		// --- 5. TITLE ----------------------------------------------------
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

		// --- 6. CATEGORY -------------------------------------------------
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

		// --- 7. EMBEDDINGS -----------------------------------------------
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
	} finally {
		// --- CARD --------------------------------------------------------
		// The decorated card is written once the run is over (success or
		// failure): step 3 stored whatever the source already had, and this
		// fills in the thumbnail, the media folder and the channel. Only the
		// fields the decoration actually produced are written again.
		const partial = await decorationTask;
		const decorated =
			partial.thumbnail !== undefined ||
			partial.mediaDirectory !== undefined ||
			partial.profile !== undefined;

		if (decorated) {
			await saveArticle(url, {
				title,
				thumbnail: partial.thumbnail ?? thumbnail,
				directory: partial.mediaDirectory ?? mediaDirectory,
				profile: partial.profile ?? profile,
				date
			});
		}
	}
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
		...analysisStream(url)
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
