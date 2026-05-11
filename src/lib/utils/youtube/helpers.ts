/**
 * Removes the 'pp' query parameter from a YouTube URL.
 * @param url The YouTube URL string.
 * @returns The URL without the 'pp' parameter.
 */
export function removeYTPpParam(url: string): string {
	try {
		const urlObj = new URL(url);
		urlObj.searchParams.delete("pp");
		return urlObj.toString();
	} catch {
		return url;
	}
}

export function removeYTTimeParam(url: string): string {
	try {
		const urlObj = new URL(url);
		urlObj.searchParams.delete("t");
		return urlObj.toString();
	} catch {
		return url;
	}
}
// ...existing code...
// Additional functions or exports
