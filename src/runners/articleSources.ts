/**
 * Article sources.
 *
 * Every source produces the same two-part result: the body (when the source
 * gives it for free) and the card decoration — thumbnail, favicon, domain,
 * profile and date — which is fetched in parallel and never in front of the
 * body. The pipeline above does not care where the data came from.
 */
import { invoke } from '@tauri-apps/api/core';
import { compactMarkdown } from '@/lib/utils/splitter';
import { extractArticle } from '@/lib/utils/articleExtractor';
import { downloadImageUrl, getMediaSrc } from '@/lib/utils/files';
import { downloadFavicon } from '@/lib/urlRouter/faviconDownloader';
import { getYouTubeThumbnailUrl } from '@/lib/utils/youtube';
import { buildYouTubeProfileUrl } from '@/lib/utils/youtube/helpers';
import { getProfile, saveProfile } from '@/stores/webStore';
import { viewState } from '@/stores/viewStore.svelte';
import type { ArticleSource } from '@/types/articleAnalysis.types';
import type { KnownProfile } from '@/runners/articleRunner';

/** What a source produced for one article. */
export interface SourceResult {
	/**
	 * Body of the article, or `null` when the source did not give it for
	 * free (a YouTube transcript costs one extra request, so it is only
	 * fetched in `full` mode).
	 */
	text: string | null;
	/** File name of the downloaded thumbnail. */
	thumbnail: string | null;
	/** Resolved src of the thumbnail. */
	thumbnailSrc: string | null;
	/** Folder the media lives in. */
	mediaDirectory: string | null;
	domain: string | null;
	/** Profile (domain or channel) the article belongs to. */
	profile: string | null;
	/** Resolved src of the profile picture. */
	profilePictureSrc: string | null;
	/** Path of the profile, used to build the "go to profile" link. */
	profilePath: string | null;
	date: string | null;
	/** Title of the article, when the source knows it without an LLM. */
	title: string | null;
}

/**
 * What a source returned: the body as soon as it is here, plus the card
 * decoration still in flight.
 */
export interface SourceFetch {
	/**
	 * Everything known as soon as the body is ready. `text` is the only field
	 * the analysis needs, so nothing else is awaited before returning.
	 */
	source: SourceResult;
	/**
	 * Thumbnail, favicon and channel of the card. It starts together with the
	 * body and resolves in the background: the caller paints it as soon as it
	 * lands and persists it when the run ends — never in front of the analysis.
	 *
	 * Every piece logs its own failure and leaves its field empty, so the
	 * decoration never rejects.
	 */
	decoration: Promise<Partial<SourceResult>>;
}

/** An empty source result: every field is filled by the caller. */
export function emptySourceResult(): SourceResult {
	return {
		text: null,
		thumbnail: null,
		thumbnailSrc: null,
		mediaDirectory: null,
		domain: null,
		profile: null,
		profilePictureSrc: null,
		profilePath: null,
		date: null,
		title: null
	};
}

function domainFromUrl(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./i, '');
	} catch {
		return '';
	}
}

/** Extracts the YouTube video id out of any of its URL shapes. */
export function youTubeVideoId(url: string): string | null {
	try {
		const parsed = new URL(url);
		const fromQuery = parsed.searchParams.get('v');
		if (fromQuery) return fromQuery;

		const segments = parsed.pathname.split('/').filter(Boolean);
		if (parsed.hostname.endsWith('youtu.be') && segments[0]) return segments[0];
		if (segments[0] === 'shorts' && segments[1]) return segments[1];
		if (segments[0] === 'live' && segments[1]) return segments[1];
		if (segments[0] === 'embed' && segments[1]) return segments[1];
	} catch {
		return null;
	}
	return null;
}

/**
 * Web source.
 *
 * The extractor service returns the markdown and the title together, so the
 * body is always available. The favicon is decoration: it starts here but
 * resolves in the returned `decoration`, never in front of the body.
 */
export async function fetchWebSource(url: string): Promise<SourceFetch> {
	const source = emptySourceResult();
	const domain = domainFromUrl(url);

	// The favicon only needs the domain, so it starts before the page fetch.
	const faviconTask = downloadFavicon(domain);

	const article = await extractArticle(url);

	source.text = compactMarkdown(article.content);
	source.title = article.title;
	source.domain = domain || null;
	source.profile = domain || null;

	const decoration = (async (): Promise<Partial<SourceResult>> => {
		const favicon = await faviconTask;
		return { profilePictureSrc: favicon?.src ?? null };
	})();

	return { source, decoration };
}

/**
 * YouTube source.
 *
 * The body (the transcript) and the card (thumbnail + channel) are two
 * independent requests, so they start together: the returned `source` carries
 * only the body, and the card arrives through the returned `decoration`.
 *
 * The profile is resolved here, not at the end of the run: the `web_profiles`
 * row is read first (no network), and only when it is missing the external
 * scraper is asked. The result is persisted straight away so the header can
 * show the channel picture without another call. A caller that already knows
 * the channel (a profile refresh) passes it in and the step costs nothing.
 */
export async function fetchYouTubeSource(
	url: string,
	options: {
		/** Fetches the transcript: an extra (and expensive) request. */
		includeTranscript: boolean;
		/** Body that is already stored: it is reused instead of fetched. */
		storedText?: string | null;
		/** Thumbnail that is already downloaded: it is not downloaded again. */
		existingThumbnail?: string | null;
		/** Channel the caller already resolved: skips the scraper entirely. */
		profile?: KnownProfile;
		/** Title the caller already knows (the channel scrape carries it). */
		title?: string;
		/**
		 * Called as soon as the thumbnail file exists, which can be while the
		 * transcript is still being fetched. Lets the view paint it without
		 * waiting for the rest of the card.
		 */
		onThumbnail?: (thumbnail: string, thumbnailSrc: string) => void;
	}
): Promise<SourceFetch> {
	const source = emptySourceResult();
	const videoId = youTubeVideoId(url);
	if (!videoId) {
		throw new Error(`Not a YouTube video url: ${url}`);
	}

	source.domain = 'youtube.com';
	// The channel scrape already knows the title: a metadata capture stores
	// it instead of leaving the card without one until a `full` run.
	source.title = options.title ?? null;

	// Body: the stored text when there is one, the transcript otherwise. A
	// missing transcript must not abort the run: the card is already being
	// decorated, and the empty body is surfaced later, at the analysis step,
	// as a "no captions" error.
	const bodyTask = (async (): Promise<string | null> => {
		if (options.storedText) return options.storedText;
		if (!options.includeTranscript) return null;

		try {
			const timedCaptions = await invoke<Array<{ caption: string }>>(
				'get_youtube_transcript_timed',
				{
					id: videoId,
					language: viewState.language
				}
			);
			return (timedCaptions ?? [])
				.map((item) => item.caption)
				.join(' ')
				.trim();
		} catch (error) {
			console.warn('[articleSources] youtube transcript fetch failed', error);
			return null;
		}
	})();

	const thumbnailTask = (async (): Promise<Partial<SourceResult>> => {
		if (options.existingThumbnail) return { thumbnail: options.existingThumbnail };

		try {
			const thumbnailUrl = getYouTubeThumbnailUrl(videoId, 'high');
			const { mediaDirectory, fileName } = await downloadImageUrl(
				thumbnailUrl,
				viewState.thumbnailReductionMagnitud
			);
			const thumbnailSrc = await getMediaSrc(fileName);
			options.onThumbnail?.(fileName, thumbnailSrc);
			return { mediaDirectory, thumbnail: fileName, thumbnailSrc };
		} catch (error) {
			console.warn('[articleSources] youtube thumbnail download failed', error);
			return {};
		}
	})();

	const profileTask = (async (): Promise<Partial<SourceResult>> => {
		try {
			return await resolveYouTubeProfile(url, videoId, options.profile);
		} catch (error) {
			console.warn('[articleSources] youtube profile resolve failed', error);
			return {};
		}
	})();

	const decoration = (async (): Promise<Partial<SourceResult>> => {
		const [thumbnail, profile] = await Promise.all([thumbnailTask, profileTask]);
		return { ...thumbnail, ...profile };
	})();

	source.text = await bodyTask;

	return { source, decoration };
}

/**
 * Resolves the channel of a YouTube video: the stored profile first (zero
 * network), the external scraper only when it is missing.
 *
 * Pure decoration: the caller runs it in the background, so a failure only
 * costs the channel of the card, never the article.
 */
async function resolveYouTubeProfile(
	url: string,
	videoId: string,
	knownProfile?: KnownProfile
): Promise<Partial<SourceResult>> {
	if (knownProfile) {
		// The caller resolved the channel before queuing the run (a profile
		// refresh scrapes it once for the whole batch): every card of that
		// batch gets it for free — no article lookup, no scraper call. The
		// `web_profiles` row was already written by the caller.
		return {
			profile: knownProfile.id,
			profilePath: knownProfile.profilePath,
			profilePictureSrc: knownProfile.profilePictureSrc
		};
	}

	const { scrapStore } = await import('@/stores/scrapStore.svelte');

	const existing = await getProfileForVideo(url);
	if (existing) {
		return {
			profile: existing.id,
			profilePath: existing.profilePath,
			profilePictureSrc: existing.profilePictureSrc
		};
	}

	const scraped = await scrapStore.getProfileInfoFromVideo(videoId);
	if (!scraped) return {};

	const profileId = scraped.id.replace(/\./g, '');
	const profileUrl = buildYouTubeProfileUrl(scraped.profilePath || profileId);

	let profilePicture: string | null = null;
	let profilePictureSrc: string | null = null;
	if (scraped.profileImage) {
		try {
			const { fileName } = await downloadImageUrl(scraped.profileImage);
			profilePicture = fileName;
			profilePictureSrc = await getMediaSrc(fileName);
		} catch (error) {
			console.warn('[articleSources] profile image download failed', error);
		}
	}

	await saveProfile(profileId, profilePicture, profileUrl, 'youtube.com');

	return {
		profile: profileId,
		profilePath: scraped.profilePath,
		profilePictureSrc
	};
}

interface StoredProfile {
	id: string;
	profilePath: string | null;
	profilePictureSrc: string | null;
}

/**
 * Reads the channel of an article from the database. The article row keeps
 * the profile id, so opening an already-known video costs one local read.
 */
async function getProfileForVideo(url: string): Promise<StoredProfile | null> {
	const { getArticleByUrl } = await import('@/stores/webStore');
	const article = await getArticleByUrl(url);
	const profileId = article?.profile ?? null;
	if (!profileId) return null;

	const profile = await getProfile(profileId);
	if (!profile) return null;

	let profilePath: string | null = null;
	if (profile.url) {
		try {
			profilePath = new URL(profile.url).pathname.replace(/^\//, '');
		} catch {
			profilePath = null;
		}
	}

	return {
		id: profileId,
		profilePath: profilePath ?? profileId,
		profilePictureSrc: profile.profilePictureSrc ?? null
	};
}

/**
 * Raw source: the text is already in memory, so nothing has to be fetched.
 */
export async function fetchRawSource(text: string): Promise<SourceResult> {
	const result = emptySourceResult();
	result.text = text;
	result.profile = 'raw-text';
	return result;
}

/** Extracts the source of an url. */
export function detectSource(url: string): ArticleSource {
	if (url.startsWith('raw-')) return 'raw';
	if (/(youtube\.com\/watch\?v=|youtu\.be\/)/.test(url)) return 'youtube';
	return 'web';
}
