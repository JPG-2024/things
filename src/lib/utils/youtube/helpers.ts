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
		// If not a valid URL, return as is
		return url;
	}
}
// ...existing code...
// Additional functions or exports
