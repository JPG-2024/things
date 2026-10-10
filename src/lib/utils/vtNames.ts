import { normalizeYouTubeUrl } from '@/lib/utils/youtube/helpers';

// Create a valid CSS ident for view-transition-name from a URL/string
export function toVTName(input: string): string {
	// ensure it starts with letters to be a safe ident
	const base = 'vt-' + input.toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
	return base || 'vt-default';
}

// Canonical view-transition-name shared by an article thumbnail and its
// detail/player thumbnail. Both sides derive it from the same URL, but the
// runner receives a normalized YouTube URL while the list keeps the raw
// article URL, so normalize here before hashing. Keep both sides on this
// helper or the thumbnails will not morph into each other.
export function toThumbnailVTName(url: string): string {
	return `vt-main-image-${toVTName(normalizeYouTubeUrl(url))}`;
}
