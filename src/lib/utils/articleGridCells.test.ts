import { describe, expect, test } from 'bun:test';
import type { ArticleRecord } from '@/stores/webStore';
import { DEFAULT_STACK_PREVIEW_COUNT, buildArticleGridCells } from './articleGridCells';

let idCounter = 0;

function article(overrides: Partial<ArticleRecord> = {}): ArticleRecord {
	idCounter += 1;
	return {
		id: `a${idCounter}`,
		url: `https://example.com/${idCounter}`,
		title: `Article ${idCounter}`,
		thumbnail: null,
		createdAt: idCounter * 100,
		...overrides
	};
}

describe('buildArticleGridCells', () => {
	test('groups same-profile articles into one stack keyed by profile id', () => {
		const cells = buildArticleGridCells([
			article({ profileId: 'p1' }),
			article({ profileId: 'p1' }),
			article({ profileId: 'p1' })
		]);

		expect(cells).toHaveLength(1);
		const stack = cells[0];
		expect(stack.kind).toBe('stack');
		expect(stack.key).toBe('profile:p1');
	});

	test('previews the latest articles newest-first', () => {
		const cells = buildArticleGridCells(
			[
				article({ profileId: 'p1', createdAt: 100 }),
				article({ profileId: 'p1', createdAt: 300 }),
				article({ profileId: 'p1', createdAt: 200 }),
				article({ profileId: 'p1', createdAt: 400 }),
				article({ profileId: 'p1', createdAt: 500 })
			],
			{ previewCount: 3 }
		);

		expect(cells).toHaveLength(1);
		const stack = cells[0];
		expect(stack.kind).toBe('stack');
		if (stack.kind !== 'stack') return;
		expect(stack.preview.map((a) => a.createdAt)).toEqual([500, 400, 300]);
	});

	test('defaults the preview size to DEFAULT_STACK_PREVIEW_COUNT', () => {
		const group = Array.from({ length: DEFAULT_STACK_PREVIEW_COUNT + 3 }, () =>
			article({ profileId: 'p1' })
		);
		const cells = buildArticleGridCells(group);
		expect(cells).toHaveLength(1);
		const stack = cells[0];
		if (stack.kind !== 'stack') return;
		expect(stack.preview).toHaveLength(DEFAULT_STACK_PREVIEW_COUNT);
	});

	test('merges later-page articles into the existing stack (stable key)', () => {
		const firstPage = buildArticleGridCells([
			article({ profileId: 'p1', createdAt: 200 }),
			article({ profileId: 'p1', createdAt: 100 })
		]);
		const secondPage = buildArticleGridCells([
			article({ profileId: 'p1', createdAt: 200 }),
			article({ profileId: 'p1', createdAt: 100 }),
			article({ profileId: 'p1', createdAt: 300 })
		]);

		expect(firstPage[0].key).toBe('profile:p1');
		expect(secondPage[0].key).toBe('profile:p1');
		const stack = secondPage[0];
		if (stack.kind !== 'stack') return;
		expect(stack.preview.map((a) => a.createdAt)).toEqual([300, 200, 100]);
	});

	test('dissolves a single-article profile into a plain article cell', () => {
		const solo = article({ profileId: 'p1' });
		const cells = buildArticleGridCells([article({ profileId: 'p2' }), solo]);

		expect(cells).toHaveLength(2);
		expect(cells.every((cell) => cell.kind === 'article')).toBe(true);
		const cell = cells.find((cell) => cell.kind === 'article' && cell.key === solo.url);
		if (cell?.kind !== 'article') return;
		expect(cell.article).toBe(solo);
	});

	test('keeps profile-less articles as plain cells interleaved by recency', () => {
		const cells = buildArticleGridCells([
			article({ profileId: null, createdAt: 500 }),
			article({ profileId: 'p1', createdAt: 400 }),
			article({ profileId: 'p1', createdAt: 100 }),
			article({ profileId: null, createdAt: 300 })
		]);

		expect(cells).toHaveLength(3);
		expect(cells.map((cell) => cell.kind)).toEqual(['article', 'stack', 'article']);
		expect(cells[0].kind === 'article' && cells[0].article.createdAt).toBe(500);
	});

	test('orders stacks by their newest article', () => {
		const cells = buildArticleGridCells([
			article({ profileId: 'old', createdAt: 100 }),
			article({ profileId: 'old', createdAt: 50 }),
			article({ profileId: 'new', createdAt: 900 }),
			article({ profileId: 'new', createdAt: 800 })
		]);

		expect(cells.map((cell) => cell.key)).toEqual(['profile:new', 'profile:old']);
	});

	test('anchors the pile on the newest capture and keeps channel rank behind it', () => {
		// The front layer is the freshest card — it owns the unread dot and
		// the cell's position — not the channel's top video. The layers
		// behind it keep the profile rank order.
		const stack = buildArticleGridCells([
			article({ id: 'ranked-behind', profileId: 'p1', createdAt: 30, profileRank: 2 }),
			article({ id: 'channel-top', profileId: 'p1', createdAt: 20, profileRank: 0 }),
			article({ id: 'channel-second', profileId: 'p1', createdAt: 10, profileRank: 1 })
		]).find((cell) => cell.kind === 'stack');

		if (stack?.kind !== 'stack') return;
		expect(stack.preview.map((a) => a.id)).toEqual([
			'ranked-behind',
			'channel-top',
			'channel-second'
		]);
	});

	test('a stack with a freshly captured article outranks an older-ranked one', () => {
		// The channel rank of the "old" profile points at a capture from long
		// ago while its new capture sits deep in the channel page: the cell
		// must rise keyed to its newest capture, not to the rank-0 video.
		const cells = buildArticleGridCells([
			article({ profileId: 'old', createdAt: 100, profileRank: 0 }),
			article({ profileId: 'old', createdAt: 90, profileRank: 1 }),
			article({ profileId: 'fresh', createdAt: 50, profileRank: 0 }),
			article({ profileId: 'fresh', createdAt: 900, profileRank: 1 })
		]);

		expect(cells.map((cell) => cell.key)).toEqual(['profile:fresh', 'profile:old']);
	});

	test('profiles without ranks fall back to capture recency in the preview', () => {
		const stack = buildArticleGridCells([
			article({ id: 'oldest', profileId: 'p1', createdAt: 10 }),
			article({ id: 'newest', profileId: 'p1', createdAt: 30 }),
			article({ id: 'middle', profileId: 'p1', createdAt: 20 })
		]).find((cell) => cell.kind === 'stack');

		if (stack?.kind !== 'stack') return;
		expect(stack.preview.map((a) => a.id)).toEqual(['newest', 'middle', 'oldest']);
	});

	test('anchors a fresh unranked capture; ranked articles lead the layers behind', () => {
		// A video captured outside the channel scrape holds no rank: it must
		// still anchor the pile (and lift the cell) instead of hiding behind
		// every ranked article.
		const stack = buildArticleGridCells([
			article({ id: 'fresh-unranked', profileId: 'p1', createdAt: 99 }),
			article({ id: 'ranked', profileId: 'p1', createdAt: 20, profileRank: 0 }),
			article({ id: 'older-unranked', profileId: 'p1', createdAt: 40 })
		]).find((cell) => cell.kind === 'stack');

		if (stack?.kind !== 'stack') return;
		expect(stack.preview.map((a) => a.id)).toEqual(['fresh-unranked', 'ranked', 'older-unranked']);
	});

	test('flags a stack as favorite when any article is starred, even outside the preview', () => {
		// The starred article is the oldest and falls outside previewCount:2,
		// but the stack must still light up its favorite star so a hidden star
		// is never invisible.
		const stack = buildArticleGridCells(
			[
				article({ profileId: 'p1', createdAt: 50 }),
				article({ profileId: 'p1', createdAt: 20 }),
				article({ profileId: 'p1', createdAt: 10, favorite: true })
			],
			{ previewCount: 2 }
		).find((cell) => cell.kind === 'stack');

		if (stack?.kind !== 'stack') return;
		expect(stack.preview.map((a) => a.createdAt)).toEqual([50, 20]);
		expect(stack.hasFavorite).toBe(true);
	});

	test('leaves a stack unflagged when no article is starred', () => {
		const stack = buildArticleGridCells([
			article({ profileId: 'p1', createdAt: 30 }),
			article({ profileId: 'p1', createdAt: 20, favorite: false })
		]).find((cell) => cell.kind === 'stack');

		if (stack?.kind !== 'stack') return;
		expect(stack.hasFavorite).toBe(false);
	});
});
