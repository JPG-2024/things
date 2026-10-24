/**
 * Article sources.
 *
 * Every source knows how to produce the same shape: the body (when the source
 * gives it for free), the thumbnail, the domain, the profile and the date.
 * The pipeline above does not care where the data came from.
 */
import { invoke } from '@tauri-apps/api/core';
import { compactMarkdown } from '@/lib/utils/splitter';
import { downloadImageUrl, getMediaSrc, resolveMediaDirectory } from '@/lib/utils/files';
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
 * The markdown comes for free with the extraction, so the body is always
 * available.
 */
export async function fetchWebSource(url: string): Promise<SourceResult> {
	const result = emptySourceResult();

	const response = await invoke<{
		metadata: Record<string, string>;
		markdown: string;
	}>('extract_blog', {
		url,
		selectors: ['body']
	});

	const metadata = response.metadata ?? {};
	result.text = compactMarkdown(response.markdown ?? '');

	const domain = domainFromUrl(url);
	result.domain = domain || null;
	result.profile = domain || null;

	const favicon = await downloadFavicon(domain);
	result.profilePictureSrc = favicon?.src ?? null;

	const imageUrl = metadata['og:image'] || metadata['twitter:image'];
	if (imageUrl) {
		const resolvedImageUrl = imageUrl.startsWith('/')
			? `${new URL(url).origin}${imageUrl}`
			: imageUrl;
		const mediaDirectory = await resolveMediaDirectory(url, domain || null);
		try {
			const thumbnail = await invoke<string>('download_and_save_image', {
				url: resolvedImageUrl,
				folderName: mediaDirectory,
				reductionMagnitud: viewState.thumbnailReductionMagnitud,
				maxDimension: 1024
			});
			result.mediaDirectory = mediaDirectory;
			result.thumbnail = thumbnail;
			result.thumbnailSrc = await getMediaSrc(thumbnail);
		} catch (error) {
			console.warn('[articleSources] thumbnail download failed', error);
		}
	}

	result.title = metadata['og:title'] || metadata['twitter:title'] || null;
	result.date = metadata['article:published_time'] || metadata['og:published_time'] || null;

	return result;
}

/**
 * YouTube source.
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
	}
): Promise<SourceResult> {
	const result = emptySourceResult();
	const videoId = youTubeVideoId(url);
	if (!videoId) {
		throw new Error(`Not a YouTube video url: ${url}`);
	}

	result.domain = 'youtube.com';

	if (options.existingThumbnail) {
		result.thumbnail = options.existingThumbnail;
	} else {
		const thumbnailUrl = getYouTubeThumbnailUrl(videoId, 'high');
		try {
			const { mediaDirectory, fileName } = await downloadImageUrl(
				thumbnailUrl,
				viewState.thumbnailReductionMagnitud
			);
			result.mediaDirectory = mediaDirectory;
			result.thumbnail = fileName;
			result.thumbnailSrc = await getMediaSrc(fileName);
		} catch (error) {
			console.warn('[articleSources] youtube thumbnail download failed', error);
		}
	}

	await resolveYouTubeProfile(result, url, videoId, options.profile);

	if (options.storedText) {
		result.text = options.storedText;
	} else if (options.includeTranscript) {
		const timedCaptions = await invoke<Array<{ caption: string }>>('get_youtube_transcript_timed', {
			id: videoId,
			language: viewState.language
		});
		result.text = (timedCaptions ?? [])
			.map((item) => item.caption)
			.join(' ')
			.trim();
	}

	return result;
}

/**
 * Resolves the channel of a YouTube video: the stored profile first (zero
 * network), the external scraper only when it is missing.
 */
async function resolveYouTubeProfile(
	result: SourceResult,
	url: string,
	videoId: string,
	knownProfile?: KnownProfile
): Promise<void> {
	if (knownProfile) {
		// The caller resolved the channel before queuing the run (a profile
		// refresh scrapes it once for the whole batch): every card of that
		// batch gets it for free — no article lookup, no scraper call. The
		// `web_profiles` row was already written by the caller.
		result.profile = knownProfile.id;
		result.profilePath = knownProfile.profilePath;
		result.profilePictureSrc = knownProfile.profilePictureSrc;
		return;
	}

	const { scrapStore } = await import('@/stores/scrapStore.svelte');

	const existing = await getProfileForVideo(url);
	if (existing) {
		result.profile = existing.id;
		result.profilePath = existing.profilePath;
		result.profilePictureSrc = existing.profilePictureSrc;
		return;
	}

	const scraped = await scrapStore.getProfileInfoFromVideo(videoId);
	if (!scraped) return;

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

	result.profile = profileId;
	result.profilePath = scraped.profilePath;
	result.profilePictureSrc = profilePictureSrc;
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
		profilePictureSrc: profile.profilePicture ?? null
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
