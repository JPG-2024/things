/**
 * Domain types of the MVP article runner.
 *
 * The pipeline produces exactly one analytic per article — a window summary or
 * window takeaways — and persists its final block in `web_articles.summary` +
 * one `article_windows` row per window. There is no task model: an article is
 * either analysed or it is not.
 */

/** Which window analytic produced the final block of an analysis. */
export type AnalysisType = 'summary' | 'takeaways';

/** Where an article came from. */
export type ArticleSource = 'web' | 'youtube' | 'raw';

/**
 * Lifecycle of an article inside the pipeline.
 *
 * - `full`: captured **and** analysed.
 * - `metadata`: captured (title, thumbnail, domain, profile) but the analysis
 *   is still pending. Opening the article completes it.
 */
export type ArticleMode = 'full' | 'metadata';

/**
 * Payload of one analysed window.
 *
 * The shape is deliberately open: adding a new analytic is one more key, not
 * an `ALTER TABLE`. `summary` is the key the pipeline always produces.
 */
export interface WindowPayload {
	/** Text of this window in the active analytic (summary or takeaways). */
	summary: string;
	/** Analytic that produced it; absent on rows written before the switch. */
	analysisType?: AnalysisType;
	/** True for the synthetic window that holds a direct final block (level 1). */
	direct?: boolean;
	[key: string]: unknown;
}

/** One analysed window of an article. */
export interface ArticleWindow {
	/** 0-based position of the window inside the article. */
	index: number;
	/** Character offset of the window inside the raw body. */
	start: number;
	/** Character offset (exclusive) of the window inside the raw body. */
	end: number;
	data: WindowPayload;
}

/** The whole analysis of an article. */
export interface ArticleAnalysis {
	/** Every analysed window, in article order. */
	windows: ArticleWindow[];
	/** Final block of the active analytic, whatever processor produced it. */
	summary: string;
	/** Which processor produced the final block. */
	analysisType: AnalysisType;
	/**
	 * Window divisor that was actually executed.
	 *
	 * `null` means the article was split by markdown headings instead of by
	 * level (the web behaviour). The executed level is always stored, never
	 * deduced from `windows.length`.
	 */
	divisor: number | null;
}
