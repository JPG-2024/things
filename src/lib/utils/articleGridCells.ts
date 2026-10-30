import type { ArticleRecord } from '@/stores/webStore';

export const DEFAULT_STACK_PREVIEW_COUNT = 3;

/** One masonry cell: a profile's article stack (compact overlap pile). */
export type ProfileStackCell = {
	kind: 'stack';
	/** Stable across page loads so merges update the cell in place. */
	key: string;
	profileId: string;
	/** Articles in display order: channel-page rank first, capture recency
	 * fallback when the row holds no rank. Up to previewCount. */
	preview: ArticleRecord[];
};

/** One masonry cell: a single article rendered as a plain ArticleItem. */
export type ArticleCell = {
	kind: 'article';
	key: string;
	article: ArticleRecord;
};

export type ArticleGridCell = ProfileStackCell | ArticleCell;

type BuildOptions = {
	/** Thumbnails shown per stack; defaults to DEFAULT_STACK_PREVIEW_COUNT. */
	previewCount?: number;
};

function articleCellKeyOf(article: ArticleRecord): string {
	return article.url ?? `id:${article.id}`;
}

function articleCreatedAt(article: ArticleRecord): number | null {
	return typeof article.createdAt === 'number' ? article.createdAt : null;
}

function articleRank(article: ArticleRecord): number | null {
	return typeof article.profileRank === 'number' ? article.profileRank : null;
}

/** Newest first: channel-page rank when the article holds one, capture recency
 * when it does not. Ranked articles always win over unranked ones. */
function articleDisplayOrder(a: ArticleRecord, b: ArticleRecord): number {
	const rankA = articleRank(a);
	const rankB = articleRank(b);
	if (rankA !== null || rankB !== null) {
		const rankCompare = (rankA ?? Number.POSITIVE_INFINITY) - (rankB ?? Number.POSITIVE_INFINITY);
		if (rankCompare !== 0) return rankCompare;
	}
	return (articleCreatedAt(b) ?? 0) - (articleCreatedAt(a) ?? 0);
}

function cellRecency(cell: ArticleGridCell): number | null {
	if (cell.kind === 'article') return articleCreatedAt(cell.article);
	return cell.preview.length > 0 ? articleCreatedAt(cell.preview[0]) : null;
}

/**
 * Groups a flat article list into masonry cells: profiles with 2+ articles
 * become one stack cell each, everything else (single-article profiles and
 * profile-less articles) stays a plain article cell. Cells are ordered by
 * recency — a stack ranks by its newest article — so fresh articles never
 * hide inside older stacks.
 *
 * Pure derivation over whatever is currently loaded: pages loaded later merge
 * into the existing stack (stable `profile:<id>` key), and a group that drops
 * below two articles dissolves back into plain cells automatically.
 */
export function buildArticleGridCells(
	articles: ArticleRecord[],
	options: BuildOptions = {}
): ArticleGridCell[] {
	const previewCount = Math.max(1, options.previewCount ?? DEFAULT_STACK_PREVIEW_COUNT);

	const groups = new Map<string, ArticleRecord[]>();
	const cells: ArticleGridCell[] = [];

	for (const article of articles) {
		const profileId = article.profileId ?? null;
		if (!profileId) {
			cells.push({ kind: 'article', key: articleCellKeyOf(article), article });
			continue;
		}
		const bucket = groups.get(profileId);
		if (bucket) {
			bucket.push(article);
		} else {
			groups.set(profileId, [article]);
		}
	}

	for (const [profileId, groupArticles] of groups) {
		// Capture time (`created_at`) rises with a fetch batch's enqueue order,
		// so sorting it DESC anchors the pile on the batch's oldest video and
		// reads reversed against the channel page. The channel rank is the
		// profile's display order, exactly what the profile list renders.
		const sorted = [...groupArticles].sort(articleDisplayOrder);
		if (sorted.length < 2) {
			// A lone article cannot stack: render it flat like ungrouped items.
			cells.push({ kind: 'article', key: articleCellKeyOf(sorted[0]), article: sorted[0] });
			continue;
		}

		cells.push({
			kind: 'stack',
			key: `profile:${profileId}`,
			profileId,
			preview: sorted.slice(0, previewCount)
		});
	}

	return cells.sort((a, b) => (cellRecency(b) ?? 0) - (cellRecency(a) ?? 0));
}
