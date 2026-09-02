import { buildYouTubeProfileUrl } from '@/lib/utils/youtube/helpers';

const SCRAPER_API_URL = import.meta.env.VITE_SCRAPER_API_URL ?? 'http://localhost:3003';

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
}

export const scrapStore = new ScrapState();
