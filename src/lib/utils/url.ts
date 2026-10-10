export const SITES_ROUTES: Record<string, string> = {
	'www.youtube.com': 'youtube'
};

import { goto } from '$app/navigation';

// View-transition-name helpers live in a pure module so they stay importable
// (and testable) without pulling in `$app/navigation`. Re-exported here to
// keep the existing `@/lib/utils/url` import sites working.
export { toVTName, toThumbnailVTName } from '@/lib/utils/vtNames';

// Programmatic navigation. The global onNavigate hook coordinates view transitions.
export function navigate(route: string, options?: { replaceState?: boolean }) {
	return goto(route, { replaceState: options?.replaceState ?? false });
}

export function stripQueryParams(url: string): string {
	const idx = url.indexOf('?');
	return idx >= 0 ? url.substring(0, idx) : url;
}

export function getRouteForDomain(domainUrl: string): string {
	// Ensure the domainUrl has a protocol for URL parsing
	const urlObj =
		domainUrl.startsWith('http://') || domainUrl.startsWith('https://')
			? new URL(domainUrl)
			: new URL('https://' + domainUrl);
	const domain = urlObj.hostname;

	return SITES_ROUTES[domain] || 'article';
}

export function isUrlList(text: string): boolean {
	const lines = text
		.trim()
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);

	if (lines.length === 0) return false;

	const urlRegex = /^https?:\/\/[^\s]+$/i;

	return lines.every((line) => urlRegex.test(line));
}

export function extractUrlList(text: string): string[] {
	if (!isUrlList(text)) return [];

	return text
		.trim()
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
}
