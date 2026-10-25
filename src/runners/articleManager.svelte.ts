/**
 * The article manager: a sequential queue of articles.
 *
 * One article at a time, because the `llama-server` is local and single
 * threaded: running two analyses in parallel would only destroy its context
 * cache and double the memory peak.
 *
 * `open()` paints whatever is already cached and only enqueues the missing
 * work; `refresh()` jumps the queue and redoes everything.
 */
import { articleState } from '@/stores/articleStore.svelte';
import { viewState } from '@/stores/viewStore.svelte';
import { runArticle, type ArticleRunOptions } from '@/runners/articleRunner';
import { normalizeYouTubeUrl } from '@/lib/utils/youtube/helpers';
import { getArticleAnalysis, getArticleByUrl, type ArticleRecord } from '@/stores/webStore';
import type { ArticleWindow } from '@/types/articleAnalysis.types';

/** One queued article. */
interface QueueEntry {
	url: string;
	/**
	 * `run` runs the whole pipeline, `analysis` re-runs only the windows and
	 * the title.
	 */
	kind: 'run' | 'analysis';
	options: ArticleRunOptions;
	/** Window level of an `analysis` entry. */
	windowLevel?: number;
	/** `refresh` jumps the queue. */
	priority: boolean;
}

/** What the manager is currently working on. */
export interface ActiveRun {
	url: string;
	step: string | null;
	done: number;
	total: number;
}

class ArticleManager {
	queue = $state<QueueEntry[]>([]);
	active = $state<ActiveRun | null>(null);

	private draining = false;

	constructor() {
		// Keeps `active` in sync with the step and the progress of the run.
		// A root effect is used because the manager lives outside the
		// component tree.
		$effect.root(() => {
			$effect(() => {
				// Reading the store fields is what registers this effect.
				void articleState.currentArticle.step;
				void articleState.currentArticle.progress;
				this.syncActive();
			});
		});
	}

	/** Number of articles waiting in the queue. */
	get pending(): number {
		return this.queue.length;
	}

	/**
	 * True while the manager is processing anything: the active run plus
	 * everything still waiting in the queue. This is the single "start →
	 * end" signal for consumers (the topbar status line).
	 */
	get processing(): boolean {
		return this.queue.length > 0 || this.active !== null;
	}

	/**
	 * Opens an article: paints the cached data immediately and enqueues the
	 * missing analysis.
	 *
	 * `options` are forwarded to the queued run so raw sources can pass
	 * their body along with the enqueue.
	 */
	async open(url: string, options: ArticleRunOptions = {}): Promise<void> {
		// One canonical form of the url for the store, the lookups and the
		// queue: a row saved under another form of the same url is found.
		url = this.canonical(url);
		articleState.begin(url);

		const article = await getArticleByUrl(url);
		if (article) {
			this.paintArticle(article);
		}

		const analysis = await getArticleAnalysis(url);
		if (analysis && analysis.windows.length > 0) {
			// The article is already analysed: nothing to do (D15).
			this.paintAnalysis(analysis.windows, analysis.summary ?? '', analysis.divisor);
			articleState.setStatus('done');
			// No run will end later, so the view must not wait for one.
			// `loaded` is deliberately NOT raised here: the topbar sweep only
			// fires when a full process ends, never on plain opens.
			viewState.loading = false;
			return;
		}

		// An article captured but not analysed is completed on open (D25):
		// opening always runs the full pipeline.
		this.enqueue(url, { mode: 'full', ...options });
	}

	/**
	 * Re-runs an article from scratch: the body, the thumbnail and the
	 * analysis are all redone. The run jumps the queue.
	 */
	refresh(url: string): void {
		url = this.canonical(url);
		this.queue = this.queue.filter((entry) => entry.url !== url);
		this.queue.unshift({
			url,
			kind: 'run',
			options: { mode: 'full', force: true },
			priority: true
		});
		this.drain();
	}

	/** Enqueues an article. */
	enqueue(url: string, options: ArticleRunOptions = {}): void {
		// Normalizing before the dedupe keeps the queue free of duplicate
		// entries for the same article under different url forms.
		url = this.canonical(url);
		const existing = this.queue.findIndex((entry) => entry.url === url);
		const entry: QueueEntry = {
			url,
			kind: 'run',
			options: { mode: 'full', ...options },
			priority: false
		};

		if (existing === -1) {
			this.queue.push(entry);
		} else {
			this.queue[existing] = entry;
		}

		this.drain();
	}

	/**
	 * Re-runs only the analysis (windows) and the title of an article, without
	 * touching the source, the thumbnail or the category.
	 *
	 * It goes through the queue: the local inference server runs one analysis
	 * at a time.
	 */
	rerunAnalysis(url: string, options: { windowLevel?: number } = {}): void {
		url = this.canonical(url);
		this.queue = this.queue.filter((entry) => !(entry.url === url && entry.kind === 'analysis'));
		this.queue.push({
			url,
			kind: 'analysis',
			options: { mode: 'full' },
			windowLevel: options.windowLevel,
			priority: false
		});

		this.drain();
	}

	/**
	 * One canonical form of the url for every queue entry and store key.
	 *
	 * Only YouTube urls are rewritten (the helper leaves everything else
	 * untouched, raw ids included): a video captured as `watch?v=X&pp=...`
	 * and opened as `watch?v=X` must resolve to the same article.
	 */
	private canonical(url: string): string {
		return normalizeYouTubeUrl(url);
	}

	/**
	 * Mirrors the step and the progress of the active run into `active`, so a
	 * consumer (a status line, a toast) can read the state of the queue
	 * without reaching into the article store.
	 */
	private syncActive(): void {
		const active = this.active;
		if (!active) return;

		// Only mirror the store when it still describes the article being
		// processed: a background run must not inherit another article's
		// step or progress.
		if (!articleState.isCurrent(active.url)) return;

		const article = articleState.currentArticle;
		const progress = article.progress;
		active.step = article.step;
		active.done = progress?.done ?? active.done;
		active.total = progress?.total ?? active.total;
	}

	/** Runs the queue, one article at a time. */
	private async drain(): Promise<void> {
		if (this.draining) return;
		this.draining = true;

		let processed = false;
		try {
			while (this.queue.length > 0) {
				const entry = this.queue.shift();
				if (!entry) break;
				processed = true;

				this.active = { url: entry.url, step: null, done: 0, total: 0 };

				// Start of a full process for the article on screen: the view
				// goes back to loading so the topbar sweep re-fires at the end.
				if (articleState.isCurrent(entry.url)) {
					viewState.loading = true;
					viewState.loaded = false;
				}

				try {
					await this.runEntry(entry);
					// End of a full process: `loading` is cleared even when the
					// user navigated away mid-run, so a finished queue can never
					// leave the view stuck behind the paste guard. The topbar
					// sweep only fires when a `full`-mode process ends for the
					// article on screen (metadata captures never sweep).
					viewState.loading = false;
					if (articleState.isCurrent(entry.url) && entry.options.mode === 'full') {
						articleState.setStatus('done');
						articleState.setStep(null);
						viewState.loaded = true;
					}
				} catch (error) {
					console.error(`[articleManager] run failed for "${entry.url}"`, error);
					viewState.loading = false;
					if (articleState.isCurrent(entry.url)) {
						articleState.setStatus('error', error instanceof Error ? error.message : String(error));
					}
				} finally {
					this.active = null;
				}
			}
		} finally {
			this.draining = false;
		}

		// The batch is over. Runs only mark the lists stale, they never refetch
		// them, so without this the cards on screen would keep the rows (and the
		// thumbnails) they had when the batch started. Skipped when a queue
		// started meanwhile: that drain repaints at its own end.
		if (processed && this.queue.length === 0 && this.active === null) {
			try {
				const { articleCacheStore } = await import('@/stores/articleCacheStore.svelte');
				await articleCacheStore.refreshAfterRuns();
			} catch (error) {
				console.error('[articleManager] failed to repaint the lists after a run', error);
			}
		}
	}

	private async runEntry(entry: QueueEntry): Promise<void> {
		if (entry.kind === 'analysis') {
			const { rerunArticleAnalysis } = await import('@/runners/articleRunner');
			await rerunArticleAnalysis(entry.url, { windowLevel: entry.windowLevel });
			return;
		}

		// Only the article on screen mirrors the pipeline steps; a background
		// run must not pollute the state of a different open article.
		if (articleState.isCurrent(entry.url)) {
			articleState.setStep('source');
		}
		try {
			await runArticle(entry.url, entry.options);
		} finally {
			// Even a failed run persists the article row (e.g. a YouTube video
			// without captions is saved with its profile and thumbnail before
			// the analysis error): the cache is invalidated and the card is
			// repainted so the saved metadata is visible regardless.
			const { articleCacheStore } = await import('@/stores/articleCacheStore.svelte');
			articleCacheStore.invalidate();

			const refreshed = await getArticleByUrl(entry.url);
			if (refreshed && articleState.isCurrent(entry.url)) {
				this.paintArticle(refreshed);
			}
		}
	}

	/** Paints the metadata of a cached article into the store. */
	private paintArticle(article: ArticleRecord): void {
		articleState.setTitle(article.title);
		// `thumbnail` is the raw media filename; `thumbnailSrc` is what
		// `getArticleByUrl` resolved for rendering (dev `/@fs`, prod asset src).
		articleState.setThumbnail(article.thumbnail, article.thumbnailSrc ?? null);
		const pictureSrc =
			typeof article.profilePictureSrc === 'string' ? article.profilePictureSrc : null;
		const profile = typeof article.profile === 'string' ? article.profile : null;
		articleState.setProfile(profile, pictureSrc);
	}

	private paintAnalysis(windows: ArticleWindow[], summary: string, divisor: number | null): void {
		articleState.setAnalysis({ windows, summary, divisor });
	}
}

export const articleManager = new ArticleManager();
