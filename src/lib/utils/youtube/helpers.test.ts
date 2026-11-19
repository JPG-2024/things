import { describe, expect, test } from 'bun:test';
import { pickRandomVideoCandidate, youTubeVideoId } from './helpers';

describe('youTubeVideoId', () => {
	test('reads the id of every supported URL shape', () => {
		expect(youTubeVideoId('https://www.youtube.com/watch?v=abc123')).toBe('abc123');
		expect(youTubeVideoId('https://youtu.be/abc123')).toBe('abc123');
		expect(youTubeVideoId('https://www.youtube.com/shorts/abc123')).toBe('abc123');
		expect(youTubeVideoId('https://www.youtube.com/live/abc123')).toBe('abc123');
		expect(youTubeVideoId('https://www.youtube.com/embed/abc123')).toBe('abc123');
	});

	test('returns null for non-YouTube or unparseable urls', () => {
		expect(youTubeVideoId('https://example.com/post')).toBeNull();
		expect(youTubeVideoId('raw-article')).toBeNull();
		expect(youTubeVideoId('not a url')).toBeNull();
	});
});

describe('pickRandomVideoCandidate', () => {
	const currentUrl = 'https://www.youtube.com/watch?v=current';

	test('excludes the current video across URL shapes', () => {
		const articles = [
			{ url: 'https://youtu.be/current' },
			{ url: 'https://www.youtube.com/watch?v=next' }
		];

		const picked = pickRandomVideoCandidate(articles, currentUrl);

		expect(picked?.url).toBe('https://www.youtube.com/watch?v=next');
	});

	test('skips non-YouTube and url-less rows', () => {
		const articles = [
			{ url: 'https://example.com/article' },
			{ url: 'raw-article' },
			{ url: null },
			{ url: 'https://www.youtube.com/watch?v=only' }
		];

		const picked = pickRandomVideoCandidate(articles, currentUrl);

		expect(picked?.url).toBe('https://www.youtube.com/watch?v=only');
	});

	test('returns null when there is nothing else to play', () => {
		expect(pickRandomVideoCandidate([], currentUrl)).toBeNull();
		expect(pickRandomVideoCandidate([{ url: 'https://youtu.be/current' }], currentUrl)).toBeNull();
		expect(
			pickRandomVideoCandidate([{ url: 'https://example.com/article' }], currentUrl)
		).toBeNull();
	});

	test('maps Math.random over the whole candidate list without truncation', () => {
		const articles = [
			{ url: 'https://www.youtube.com/watch?v=one' },
			{ url: 'https://www.youtube.com/watch?v=two' },
			{ url: 'https://www.youtube.com/watch?v=three' }
		];
		const original = Math.random;

		try {
			Math.random = () => 0;
			expect(pickRandomVideoCandidate(articles, currentUrl)?.url).toBe(
				'https://www.youtube.com/watch?v=one'
			);

			Math.random = () => 0.999;
			expect(pickRandomVideoCandidate(articles, currentUrl)?.url).toBe(
				'https://www.youtube.com/watch?v=three'
			);
		} finally {
			Math.random = original;
		}
	});

	test('preserves the caller row shape', () => {
		const articles = [{ url: 'https://www.youtube.com/watch?v=one', title: 'One' }];

		const picked = pickRandomVideoCandidate(articles, currentUrl);

		expect(picked?.title).toBe('One');
	});
});
