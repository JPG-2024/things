/**
 * State of the article that is currently open.
 *
 * The store holds **data and progress**, never preferences: those live in
 * `viewState`. The body of the article is deliberately absent — it is read
 * from the raw content file on demand, so opening an article never pulls
 * megabytes of text into the webview.
 */
import type { ArticleAnalysis } from '@/types/articleAnalysis.types';

export type ArticleStatus = 'idle' | 'loading' | 'running' | 'done' | 'error';

/** Steps of the pipeline, in execution order. */
export type ArticleStep =
	| 'source'
	| 'raw'
	| 'article'
	| 'analysis'
	| 'title'
	| 'category'
	| 'embeddings';

export interface ArticleProgress {
	done: number;
	total: number;
}

export interface CurrentArticle {
	url: string;
	status: ArticleStatus;
	/** Step of the pipeline that is currently running. */
	step: ArticleStep | null;
	/** Progress inside the current step, when the step reports it. */
	progress: ArticleProgress | null;
	title: string | null;
	thumbnail: string | null;
	/** Resolved src of the thumbnail (dev `/@fs` path, prod asset src). */
	thumbnailSrc: string | null;
	domain: string | null;
	/** Profile (channel / domain) the article belongs to. */
	profile: string | null;
	/** Resolved src of the profile picture. */
	profilePictureSrc: string | null;
	categories: string[];
	analysis: ArticleAnalysis | null;
	error: string | null;
}

function emptyArticle(url = ''): CurrentArticle {
	return {
		url,
		status: 'idle',
		step: null,
		progress: null,
		title: null,
		thumbnail: null,
		thumbnailSrc: null,
		domain: null,
		profile: null,
		profilePictureSrc: null,
		categories: [],
		analysis: null,
		error: null
	};
}

class ArticleState {
	currentArticle = $state<CurrentArticle>(emptyArticle());

	/** URL of the article the store is currently describing. */
	get url(): string {
		return this.currentArticle.url;
	}

	/** True when `url` is the article the store is currently describing. */
	isCurrent(url: string): boolean {
		return this.currentArticle.url === url;
	}

	/** Prepares the store for a (new) article. */
	begin(url: string): void {
		this.currentArticle = { ...emptyArticle(url), status: 'loading' };
	}

	/** Clears the store. */
	reset(): void {
		this.currentArticle = emptyArticle();
	}

	setStatus(status: ArticleStatus, error: string | null = null): void {
		this.currentArticle.status = status;
		this.currentArticle.error = error;
	}

	setStep(step: ArticleStep | null, progress: ArticleProgress | null = null): void {
		this.currentArticle.step = step;
		this.currentArticle.progress = progress;
	}

	setProgress(progress: ArticleProgress | null): void {
		this.currentArticle.progress = progress;
	}

	setTitle(title: string | null): void {
		this.currentArticle.title = title;
	}

	setThumbnail(thumbnail: string | null, thumbnailSrc: string | null = null): void {
		this.currentArticle.thumbnail = thumbnail;
		this.currentArticle.thumbnailSrc = thumbnailSrc;
	}

	setProfile(profile: string | null, profilePictureSrc: string | null = null): void {
		this.currentArticle.profile = profile;
		if (profilePictureSrc !== null) {
			this.currentArticle.profilePictureSrc = profilePictureSrc;
		}
	}

	setCategories(categories: string[]): void {
		this.currentArticle.categories = [...categories];
	}

	setAnalysis(analysis: ArticleAnalysis | null): void {
		this.currentArticle.analysis = analysis;
	}

	/**
	 * Applies a finished analysis, but only when the article is still the one
	 * on screen. A run that finishes after the user navigated away persists in
	 * the database, but it must not repaint the current article.
	 */
	applyAnalysis(url: string, analysis: ArticleAnalysis): boolean {
		if (!this.isCurrent(url)) return false;
		this.setAnalysis(analysis);
		return true;
	}
}

export const articleState = new ArticleState();
