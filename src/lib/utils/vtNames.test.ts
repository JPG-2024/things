import { describe, expect, test } from 'bun:test';
import { toVTName, toThumbnailVTName } from './vtNames';
import { normalizeYouTubeUrl } from '@/lib/utils/youtube/helpers';

describe('toVTName', () => {
	test('produces a valid CSS ident starting with a letter', () => {
		const name = toVTName('https://www.youtube.com/watch?v=abc');
		expect(name.startsWith('v')).toBe(true);
		expect(/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name)).toBe(true);
	});

	test('is deterministic for the same input', () => {
		expect(toVTName('https://example.com/a')).toBe(toVTName('https://example.com/a'));
	});
});

describe('toThumbnailVTName', () => {
	// Regression: the list side keeps the raw article URL, while the YouTube
	// runner receives a normalized URL. Both must hash to the same
	// view-transition-name or the thumbnails never morph into each other.
	const raw = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123&t=42s';

	test('raw and normalized YouTube URLs share one name', () => {
		expect(toThumbnailVTName(raw)).toBe(toThumbnailVTName(normalizeYouTubeUrl(raw)));
	});

	test('youtu.be short links match the canonical watch URL', () => {
		const short = 'https://youtu.be/dQw4w9WgXcQ';
		const canonical = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
		expect(toThumbnailVTName(short)).toBe(toThumbnailVTName(canonical));
	});

	test('video id casing never splits the name', () => {
		expect(toThumbnailVTName('https://www.youtube.com/watch?v=ABC')).toBe(
			toThumbnailVTName('https://www.youtube.com/watch?v=abc')
		);
	});

	test('non-YouTube URLs still yield a stable named ident', () => {
		const name = toThumbnailVTName('https://example.com/some post');
		expect(name).toBe(toThumbnailVTName('https://example.com/some post'));
		expect(name.startsWith('vt-main-image-')).toBe(true);
	});
});
