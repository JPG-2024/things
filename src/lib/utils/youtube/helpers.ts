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
// ...existing code...
// Additional functions or exports
