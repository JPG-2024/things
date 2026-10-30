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

	test('stack preview follows the profile rank over capture recency', () => {
		// Capture time rises with a fetch batch's enqueue order (runs are
		// sequential), so created_at DESC would anchor the pile on the batch's
		// oldest video and read reversed against the channel page.
		const stack = buildArticleGridCells([
			article({ profileId: 'p1', createdAt: 30, profileRank: 2 }),
			article({ profileId: 'p1', createdAt: 20, profileRank: 0 }),
			article({ profileId: 'p1', createdAt: 10, profileRank: 1 })
		]).find((cell) => cell.kind === 'stack');

		if (stack?.kind !== 'stack') return;
		expect(stack.preview.map((a) => a.id)).toEqual(['a31', 'a32', 'a30']);
	});

	test('profiles without ranks fall back to capture recency in the preview', () => {
		const stack = buildArticleGridCells([
			article({ profileId: 'p1', createdAt: 10 }),
			article({ profileId: 'p1', createdAt: 30 }),
			article({ profileId: 'p1', createdAt: 20 })
		]).find((cell) => cell.kind === 'stack');

		if (stack?.kind !== 'stack') return;
		expect(stack.preview.map((a) => a.id)).toEqual(['a34', 'a35', 'a33']);
	});

	test('ranked articles stay ahead of unranked ones in mixed buckets', () => {
		const stack = buildArticleGridCells([
			article({ profileId: 'p1', createdAt: 99 }),
			article({ profileId: 'p1', createdAt: 20, profileRank: 0 }),
			article({ profileId: 'p1', createdAt: 40 })
		]).find((cell) => cell.kind === 'stack');

		if (stack?.kind !== 'stack') return;
		expect(stack.preview.map((a) => a.id)).toEqual(['a37', 'a36', 'a38']);
	});
});
