import { invoke } from '@tauri-apps/api/core';
import { buildYouTubeProfileUrl } from '@/lib/utils/youtube/helpers';
import { normalizeYouTubeUrl } from '@/lib/utils/youtube/helpers';
import { downloadImageUrl, getMediaSrc } from '@/lib/utils/files';
import { saveProfile } from '@/stores/webStore';
import type { KnownProfile } from '@/runners/articleRunner';

const SCRAPER_API_URL = import.meta.env.VITE_SCRAPER_API_URL ?? 'http://localhost:3003';

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
	isFetchingMissingVideos = $state(false);
	maxVideos = $state(5);

	async getYoutubeProfile(
		handleOrUrl: string,
		options?: { scroll?: boolean }
	): Promise<YoutubeProfile | null> {
		this.loading = true;
		this.error = null;
		try {
			const data = options?.scroll
				? await this.fetchYoutubeProfileWithScroll(handleOrUrl)
				: await this.fetchYoutubeProfileViaScrape(handleOrUrl);
			this.profile = data;
			return data;
		} catch (err) {
			this.error = err instanceof Error ? err.message : String(err);
			return null;
		} finally {
			this.loading = false;
		}
	}

	private async fetchYoutubeProfileViaScrape(handleOrUrl: string): Promise<YoutubeProfile> {
		const url = buildYouTubeProfileUrl(handleOrUrl);
		const res = await fetch(`${SCRAPER_API_URL}/api/scrape`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ url })
		});

		if (!res.ok) {
			throw new Error(`Scrape request failed: ${res.status} ${res.statusText}`);
		}

		return (await res.json()) as YoutubeProfile;
	}

	private async fetchYoutubeProfileWithScroll(handleOrUrl: string): Promise<YoutubeProfile> {
		const profileUrl = buildYouTubeProfileUrl(handleOrUrl);
		let profilePath: string;
		try {
			profilePath = new URL(profileUrl).pathname.replace(/^\//, '');
		} catch {
			profilePath = handleOrUrl.trim().replace(/^\/+/, '');
		}

		const res = await fetch(`${SCRAPER_API_URL}/api/profile/youtube/${profilePath}?scroll=true`);

		if (!res.ok) {
			throw new Error(`Profile scrape request failed: ${res.status} ${res.statusText}`);
		}

		return (await res.json()) as YoutubeProfile;
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
		return this.getYoutubeProfile(profileUrl);
	}

	/**
	 * Turns the channel the scrape just returned into the `KnownProfile` the
	 * runs are queued with: one picture download (Rust skips a file it already
	 * has) and one row upsert for the whole batch, instead of one
	 * `/api/video` + `/api/scrape` round trip per video.
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
			const youtubeProfile = await this.getYoutubeProfile(handle, { scroll: false });
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
					articleManager.enqueue(video.url, { mode: 'metadata', profile: knownProfile });
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
			await invoke<number>('set_profile_article_order', {
				profileId: normalizedProfileId,
				urls: normalized.map((video) => video.url)
			});

			if (fetched === 0) {
				// Nothing was queued, so no run will repaint the list and the rank
				// reorder still has to land. When there are runs, the repaint
				// belongs to the queue: refetching here would only show whatever
				// finished first and hide the rest until the next navigation.
				const { articleCacheStore } = await import('@/stores/articleCacheStore.svelte');
				await articleCacheStore.fetchProfileArticles(profileId, {
					force: true
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
