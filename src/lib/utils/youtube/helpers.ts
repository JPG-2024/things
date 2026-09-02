/**
 * Removes the 'pp' query parameter from a YouTube URL.
 * @param url The YouTube URL string.
 * @returns The URL without the 'pp' parameter.
 */
export function removeYTPpParam(url: string): string {
	try {
		const urlObj = new URL(url);
		urlObj.searchParams.delete('pp');
		return urlObj.toString();
	} catch {
		return url;
	}
}

export function removeYTTimeParam(url: string): string {
	try {
		const urlObj = new URL(url);
		urlObj.searchParams.delete('t');
		return urlObj.toString();
	} catch {
		return url;
	}
}

/**
 * Returns a canonical YouTube video URL containing only the video id.
 * Strips tracking params (?si=, ?list=, ?t=, ?pp=, ...) that would otherwise
 * produce duplicate articles for the same video.
 */
export function normalizeYouTubeUrl(url: string): string {
	try {
		const urlObj = new URL(url);
		const isYouTubeHost =
			urlObj.hostname === 'youtube.com' ||
			urlObj.hostname === 'www.youtube.com' ||
			urlObj.hostname === 'youtu.be' ||
			urlObj.hostname === 'www.youtu.be' ||
			urlObj.hostname === 'm.youtube.com';
		if (!isYouTubeHost) return url;

		let videoId = urlObj.searchParams.get('v');
		if (!videoId && (urlObj.hostname === 'youtu.be' || urlObj.hostname === 'www.youtu.be')) {
			videoId = urlObj.pathname.split('/').filter(Boolean)[0] ?? null;
		}

		if (!videoId) return url;
		return `https://www.youtube.com/watch?v=${videoId}`;
	} catch {
		return url;
	}
}
/**
 * Builds a canonical YouTube profile/channel URL from a handle, path, or full URL.
 * YoutubeVideoInfo.profile is now a handle like `@syntaxfm` (from `https://www.youtube.com/@syntaxfm`),
 * but the scraper API (`/api/scrape`) expects a full URL. This helper bridges the two
 * and remains backwards-compatible with cached full URLs.
 */
export function buildYouTubeProfileUrl(handleOrUrl: string): string {
	const v = handleOrUrl.trim();
	if (!v) throw new Error('buildYouTubeProfileUrl: empty handleOrUrl');
	if (v.startsWith('http://') || v.startsWith('https://')) return v;
	// Already a path-like identifier (handle or channel prefix)
	if (
		v.startsWith('@') ||
		v.startsWith('channel/') ||
		v.startsWith('c/') ||
		v.startsWith('user/')
	) {
		return `https://www.youtube.com/${v}`;
	}
	// Bare handle without @ (legacy)
	return `https://www.youtube.com/@${v.replace(/^@/, '')}`;
}

export function normalizeYouTubeHandle(handle: string): string {
	const v = handle.trim();
	if (!v) return v;
	return v.startsWith('@') ? v : `@${v.replace(/^@/, '')}`;
}
