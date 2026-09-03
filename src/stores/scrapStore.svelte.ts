import { invoke } from '@tauri-apps/api/core';
import { buildYouTubeProfileUrl } from '@/lib/utils/youtube/helpers';
import { normalizeYouTubeUrl } from '@/lib/utils/youtube/helpers';

const SCRAPER_API_URL = import.meta.env.VITE_SCRAPER_API_URL ?? 'http://localhost:3003';

export interface FetchMissingProfileVideosResult {
	total: number;
	missing: number;
	fetched: number;
	failed: number;
	skippedExisting: number;
	errors?: Array<{ url: string; error: string }>;
}

export interface YoutubeProfile {
	id: string;
	profilePath: string;
	videos: string[];
	profileImage: string;
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
	currentYoutubeProfile = $state<YoutubeProfile | null>(null);
	isFetchingMissingVideos = $state(false);
	parallelFetch = $state(false);
	maxVideos = $state(5);
	parallelVideosAmount = $state(2);

	async getYoutubeProfile(handleOrUrl: string): Promise<YoutubeProfile | null> {
		this.loading = true;
		this.error = null;
		try {
			const url = buildYouTubeProfileUrl(handleOrUrl);
			const res = await fetch(`${SCRAPER_API_URL}/api/scrape`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ url })
			});

			if (!res.ok) {
				throw new Error(`Scrape request failed: ${res.status} ${res.statusText}`);
			}

			const data = (await res.json()) as YoutubeProfile;
			this.profile = data;
			return data;
		} catch (err) {
			this.error = err instanceof Error ? err.message : String(err);
			return null;
		} finally {
			this.loading = false;
		}
	}

	async getYoutubeVideoInfo(videoId: string): Promise<YoutubeVideoInfo | null> {
		this.loading = true;
		this.error = null;
		try {
			const res = await fetch(
				`${SCRAPER_API_URL}/api/video/youtube/${encodeURIComponent(videoId)}`
			);

			if (!res.ok) {
				throw new Error(`Video info request failed: ${res.status} ${res.statusText}`);
			}

			const data = (await res.json()) as YoutubeVideoInfo;
			this.videoInfo = data;
			return data;
		} catch (err) {
			this.error = err instanceof Error ? err.message : String(err);
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
		const profile = await this.getYoutubeProfile(profileUrl);
		this.currentYoutubeProfile = profile;
		return profile;
	}

	async fetchMissingProfileVideos(
		profileId: string,
		options?: {
			parallel?: boolean;
			skipTaskIds?: string[];
			maxVideos?: number;
			parallelVideosAmount?: number;
		}
	): Promise<FetchMissingProfileVideosResult> {
		const parallel = options?.parallel ?? this.parallelFetch;
		const skipTaskIds = options?.skipTaskIds ?? ['profile'];
		const maxVideos = Math.min(
			50,
			Math.max(1, Math.trunc(options?.maxVideos ?? this.maxVideos ?? 5))
		);
		const parallelAmount = Math.min(
			10,
			Math.max(1, Math.trunc(options?.parallelVideosAmount ?? this.parallelVideosAmount ?? 2))
		);
		const handle = profileId.trim();
		if (!handle) {
			throw new Error('Missing profileId');
		}
		const normalizedProfileId = handle.toLowerCase().replace(/\s+/g, '-');

		this.isFetchingMissingVideos = true;
		this.error = null;

		try {
			const youtubeProfile = await this.getYoutubeProfile(handle);
			if (!youtubeProfile) {
				throw new Error(this.error ?? 'Failed to fetch profile videos');
			}

			const total = youtubeProfile.videos.length;

			const normalized = [
				...new Set(
					youtubeProfile.videos
						.map((u) => {
							try {
								return normalizeYouTubeUrl(u.trim());
							} catch {
								return u.trim();
							}
						})
						.map((u) => u.trim())
						.filter(Boolean)
				)
			];

			if (normalized.length === 0) {
				return { total, missing: 0, fetched: 0, failed: 0, skippedExisting: 0 };
			}

			const existing = await invoke<string[]>('filter_existing_article_urls', {
				urls: normalized
			});

			const existingSet = new Set(existing);
			const missing = normalized.filter((u) => !existingSet.has(u));
			const skippedExisting = normalized.length - missing.length;

			const toFetch = missing.slice(0, maxVideos);

			if (toFetch.length === 0) {
				const { articleCacheStore } = await import('@/stores/articleCacheStore.svelte');
				await articleCacheStore.fetchArticlesWithoutProfile({ profileId, force: true });
				return { total, missing: 0, fetched: 0, failed: 0, skippedExisting };
			}

			const { urlRouter } = await import('@/lib/urlRouter/urlRouter');

			let fetched = 0;
			let failed = 0;
			const errors: Array<{ url: string; error: string }> = [];

			const runOne = async (url: string) => {
				try {
					await urlRouter(url, {
						runnerOptions: { skipTaskIds, profileId: normalizedProfileId }
					});
					fetched++;
				} catch (err) {
					failed++;
					errors.push({ url, error: err instanceof Error ? err.message : String(err) });
				}
			};

			if (parallel) {
				for (let i = 0; i < toFetch.length; i += parallelAmount) {
					const batch = toFetch.slice(i, i + parallelAmount);
					await Promise.allSettled(batch.map((url) => runOne(url)));
				}
			} else {
				for (const url of toFetch) {
					await runOne(url);
				}
			}

			const { articleCacheStore } = await import('@/stores/articleCacheStore.svelte');
			await articleCacheStore.fetchArticlesWithoutProfile({ profileId, force: true });

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
