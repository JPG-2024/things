import { invoke } from '@tauri-apps/api/core';
import { buildYouTubeProfileUrl } from '@/lib/utils/youtube/helpers';
import { normalizeYouTubeUrl } from '@/lib/utils/youtube/helpers';
import { downloadImageUrl, getMediaSrc } from '@/lib/utils/files';
import { assignCategoriesToArticle, getProfileCategories, saveProfile } from '@/stores/webStore';
import { errorStore } from '@/stores/errorStore.svelte';
import {
	YOUTUBE_SCRAPE_LIMIT_DEFAULT,
	YOUTUBE_SCRAPE_LIMIT_MAX,
	YOUTUBE_SCRAPE_LIMIT_MIN
} from '@/constants';
import type { KnownProfile } from '@/runners/articleRunner';

export interface FetchMissingProfileVideosResult {
	total: number;
	missing: number;
	fetched: number;
	failed: number;
	skippedExisting: number;
	errors?: Array<{ url: string; error: string }>;
}

export interface YouTubeVideo {
	url: string;
	title: string;
}

export interface YoutubeProfile {
	id: string;
	profilePath: string;
	videos: YouTubeVideo[];
	/** `null` when the channel has no avatar the scraper could read. */
	profileImage: string | null;
}

export interface YoutubeVideoInfo {
	id: string;
	/** YouTube handle / channel identifier, e.g. `@syntaxfm` (extracted from `https://www.youtube.com/@syntaxfm`). Previously a full URL. */
	profile: string;
}

class ScrapState {
	loading = $state(false);
	error = $state<string | null>(null);
	profile = $state<YoutubeProfile | null>(null);
	videoInfo = $state<YoutubeVideoInfo | null>(null);
	isFetchingMissingVideos = $state(false);
	maxVideos = $state(5);
	/**
	 * Unique videos the scraper collects while scrolling a channel page
	 * (`?scroll=true&limit=N`); `maxVideos` only caps how many of them are
	 * enqueued afterwards.
	 */
	scrollLimit = $state(YOUTUBE_SCRAPE_LIMIT_DEFAULT);
	/**
	 * Chromium binary the embedded YouTube scraper should launch. Empty means
	 * "auto-detect the system install" (see `youtube_scrape.rs`).
	 */
	chromiumPath = $state('');

	async getYoutubeProfile(
		handleOrUrl: string,
		options?: { scroll?: boolean; limit?: number }
	): Promise<YoutubeProfile | null> {
		this.loading = true;
		this.error = null;
		try {
			const data = await this.fetchYoutubeProfile(handleOrUrl, options);
			this.profile = data;
			return data;
		} catch (err) {
			this.error = err instanceof Error ? err.message : String(err);
			// `this.error` has no renderer; the error center is its surface.
			errorStore.report(err, {
				feature: 'capture',
				userMessage: 'YouTube profile scrape failed',
				level: 'warn',
				log: false
			});
			return null;
		} finally {
			this.loading = false;
		}
	}

	/**
	 * Scrapes the channel page through the embedded Chromium
	 * (`youtube_scrape.rs`). The cheap first-batch read and the scrolling
	 * refresh are the same command; `scroll` only decides whether endless
	 * continuations are consumed.
	 */
	private async fetchYoutubeProfile(
		handleOrUrl: string,
		options?: { scroll?: boolean; limit?: number }
	): Promise<YoutubeProfile> {
		const profileUrl = buildYouTubeProfileUrl(handleOrUrl);
		let profilePath: string;
		try {
			profilePath = new URL(profileUrl).pathname.replace(/^\//, '');
		} catch {
			profilePath = handleOrUrl.trim().replace(/^\/+/, '');
		}

		// Clamp to the contract (1..1500) so a hand-edited stored value never
		// reaches the scraper out of range.
		const safeLimit = Math.min(
			YOUTUBE_SCRAPE_LIMIT_MAX,
			Math.max(YOUTUBE_SCRAPE_LIMIT_MIN, Math.trunc(options?.limit ?? YOUTUBE_SCRAPE_LIMIT_DEFAULT))
		);

		return invoke<YoutubeProfile>('scrape_youtube_profile', {
			profilePath,
			scroll: options?.scroll ?? false,
			limit: safeLimit
		});
	}

	async getYoutubeVideoInfo(videoId: string): Promise<YoutubeVideoInfo | null> {
		this.loading = true;
		this.error = null;
		try {
			const data = await invoke<YoutubeVideoInfo>('get_youtube_video_owner', { videoId });
			this.videoInfo = data;
			return data;
		} catch (err) {
			this.error = err instanceof Error ? err.message : String(err);
			// `this.error` has no renderer; the error center is its surface.
			errorStore.report(err, {
				feature: 'capture',
				userMessage: 'YouTube video info scrape failed',
				level: 'warn',
				log: false
			});
			return null;
		} finally {
			this.loading = false;
		}
	}

	async getProfileInfoFromVideo(videoId: string): Promise<YoutubeProfile | null> {
		const videoInfo = await this.getYoutubeVideoInfo(videoId);
		if (!videoInfo) {
			return null;
		}
		const profileUrl = buildYouTubeProfileUrl(videoInfo.profile);
		return this.getYoutubeProfile(profileUrl);
	}

	/**
	 * Turns the channel the scrape just returned into the `KnownProfile` the
	 * runs are queued with: one picture download (Rust skips a file it already
	 * has) and one row upsert for the whole batch, instead of one video-owner +
	 * channel scrape round trip per video.
	 */
	private async resolveKnownProfile(profile: YoutubeProfile): Promise<KnownProfile> {
		// Same normalization `resolveYouTubeProfile` applies to a scraped id.
		const id = profile.id.replace(/\./g, '');
		const profilePath = profile.profilePath || id;

		let profilePicture: string | null = null;
		if (profile.profileImage) {
			try {
				const downloaded = await downloadImageUrl(profile.profileImage);
				profilePicture = downloaded.fileName;
			} catch (error) {
				console.warn('[scrapStore] profile picture download failed', error);
			}
		}

		await saveProfile(id, profilePicture, buildYouTubeProfileUrl(profilePath), 'youtube.com');

		return {
			id,
			profilePath,
			profilePicture,
			profilePictureSrc: profilePicture ? await getMediaSrc(profilePicture) : null
		};
	}

	async fetchMissingProfileVideos(
		profileId: string,
		options?: {
			maxVideos?: number;
			/**
			 * Scroll the channel page up to `scrollLimit` unique videos instead
			 * of reading only the first DOM batch. Off by default: casual
			 * callers (paste routing, hotkeys) keep the cheap first-batch read;
			 * the explicit refresh buttons turn it on.
			 */
			scroll?: boolean;
		}
	): Promise<FetchMissingProfileVideosResult> {
		const maxVideos = Math.min(
			50,
			Math.max(1, Math.trunc(options?.maxVideos ?? this.maxVideos ?? 5))
		);
		const handle = profileId.trim();
		if (!handle) {
			throw new Error('Missing profileId');
		}
		const normalizedProfileId = handle.toLowerCase().replace(/\s+/g, '-');

		this.isFetchingMissingVideos = true;
		this.error = null;

		try {
			const youtubeProfile = await this.getYoutubeProfile(handle, {
				scroll: options?.scroll ?? false,
				limit: this.scrollLimit
			});
			if (!youtubeProfile) {
				throw new Error(this.error ?? 'Failed to fetch profile videos');
			}

			const total = youtubeProfile.videos.length;

			const normalized: YouTubeVideo[] = [];
			for (const video of youtubeProfile.videos) {
				const rawUrl = video.url?.trim();
				if (!rawUrl) continue;
				let normalizedUrl = rawUrl;
				try {
					normalizedUrl = normalizeYouTubeUrl(rawUrl);
				} catch {
					/* keep raw url */
				}
				if (!normalized.some((entry) => entry.url === normalizedUrl)) {
					normalized.push({ url: normalizedUrl, title: video.title ?? '' });
				}
			}

			if (normalized.length === 0) {
				return { total, missing: 0, fetched: 0, failed: 0, skippedExisting: 0 };
			}

			const existing = await invoke<string[]>('filter_existing_article_urls', {
				urls: normalized.map((video) => video.url)
			});

			const existingSet = new Set(existing);
			const missing = normalized.filter((video) => !existingSet.has(video.url));
			const skippedExisting = normalized.length - missing.length;

			const toFetch = missing.slice(0, maxVideos);

			const { articleManager } = await import('@/runners/articleManager.svelte');

			if (toFetch.length === 0) {
				// Nothing to fetch, but the scrape still carries the channel-page
				// order: refresh ranks so the list mirrors YouTube even when the
				// videos were all saved on an earlier pass.
				await invoke<number>('set_profile_article_order', {
					profileId: normalizedProfileId,
					urls: normalized.map((video) => video.url)
				});
				const { articleCacheStore } = await import('@/stores/articleCacheStore.svelte');
				await articleCacheStore.fetchProfileArticles(profileId, {
					force: true
				});
				return { total, missing: 0, fetched: 0, failed: 0, skippedExisting };
			}

			// The channel is already in hand: its picture and its row are
			// resolved once here and handed to every queued run, so none of
			// them asks the scraper about the channel again.
			const knownProfile = await this.resolveKnownProfile(youtubeProfile);

			let fetched = 0;
			let failed = 0;
			const errors: Array<{ url: string; error: string }> = [];

			// The videos are captured in `metadata` mode: the card (title,
			// thumbnail, channel) is stored and the article is analysed when it
			// is opened. Enqueueing is synchronous and the manager runs one
			// article at a time, so there is nothing to fan out here.
			for (const video of toFetch) {
				try {
					articleManager.enqueue(video.url, {
						mode: 'metadata',
						profile: knownProfile,
						// The channel scrape already carries the title: the card
						// is stored with it instead of waiting for a `full` run.
						title: video.title ?? undefined
					});
					fetched++;
				} catch (err) {
					failed++;
					errors.push({
						url: video.url,
						error: err instanceof Error ? err.message : String(err)
					});
				}
			}

			// Mirror the channel-page order onto the saved articles so the
			// profile list matches what YouTube shows.
			const rankingUrls = normalized.map((video) => video.url);

			if (fetched === 0) {
				// Nothing was queued, so no run will repaint the list and the
				// rank reorder still has to land before the forced refetch.
				await invoke<number>('set_profile_article_order', {
					profileId: normalizedProfileId,
					urls: rankingUrls
				});
				const { articleCacheStore } = await import('@/stores/articleCacheStore.svelte');
				await articleCacheStore.fetchProfileArticles(profileId, {
					force: true
				});
			} else {
				// Runs are still queued: their rows do not exist yet, so a rank
				// written now matches nothing and the drain-time repaint would
				// keep the old videos ranked first and drop the new ones into
				// the NULL tail reversed. The rank rewrite is deferred to the
				// manager's batch-end hook: every row is persisted by then, and
				// the repaint that follows re-queries the fixed order.
				const unsubscribe = articleManager.afterDrain(async () => {
					unsubscribe();
					try {
						await invoke<number>('set_profile_article_order', {
							profileId: normalizedProfileId,
							urls: rankingUrls
						});
					} catch (error) {
						console.error('[scrapStore] failed to rank profile articles after the batch', error);
					}
					// The batch's categories come from the profile row: copy them
					// onto every video captured in this batch, in the same hook as
					// the rank rewrite (rows are persisted by now, and the drain
					// repaints the lists right after the subscribers run — so
					// category-pinned lists, e.g. the Music tab, show the new
					// videos without waiting for an analysis in PostView). Only
					// `toFetch` urls are written: they are brand-new rows, so the
					// replace-all cannot clobber earlier links. Separate try from
					// the rank rewrite so one failure never skips the other.
					try {
						const categoryIds = await getProfileCategories(normalizedProfileId);
						if (categoryIds.length > 0) {
							for (const video of toFetch) {
								await assignCategoriesToArticle({
									articleUrl: video.url,
									categoryIds
								});
							}
						}
					} catch (error) {
						console.error('[scrapStore] failed to copy profile categories after the batch', error);
					}
				});
			}

			return {
				total,
				missing: toFetch.length,
				fetched,
				failed,
				skippedExisting,
				errors: errors.length ? errors : undefined
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.error = message;
			throw err;
		} finally {
			this.isFetchingMissingVideos = false;
		}
	}
}

export const scrapStore = new ScrapState();
