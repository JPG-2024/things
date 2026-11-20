import { describe, expect, test } from 'bun:test';
import { isYouTubeEndedEvent, pickRandomVideoCandidate, youTubeVideoId } from './helpers';

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

describe('isYouTubeEndedEvent', () => {
	test('detects ENDED from a raw or parsed payload', () => {
		const ended = '{"event":"onStateChange","info":0,"id":1,"channel":"widget"}';

		expect(isYouTubeEndedEvent(ended)).toBe(true);
		expect(isYouTubeEndedEvent(JSON.parse(ended))).toBe(true);
	});

	test('ignores the other playback states', () => {
		expect(isYouTubeEndedEvent({ event: 'onStateChange', info: 1 })).toBe(false);
		expect(isYouTubeEndedEvent({ event: 'onStateChange', info: 2 })).toBe(false);
		expect(isYouTubeEndedEvent({ event: 'onStateChange', info: 3 })).toBe(false);
	});

	test('rejects unrelated or malformed payloads', () => {
		expect(isYouTubeEndedEvent('{"event":"onReady"}')).toBe(false);
		expect(isYouTubeEndedEvent('not json')).toBe(false);
		expect(isYouTubeEndedEvent(null)).toBe(false);
		expect(isYouTubeEndedEvent(undefined)).toBe(false);
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
