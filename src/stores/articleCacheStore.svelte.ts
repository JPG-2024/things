import {
	getArticlesByCategories,
	getArticlesWithoutProfile,
	getProfiles,
	type ArticleWithTasks,
	type ArticleProfile,
	type CategoryArticlesQuery,
	type CategoryWithArticles
} from '@/stores/webStore';
import { PaginationResource } from '@/stores/paginationResource.svelte';
import { SvelteMap } from 'svelte/reactivity';
import { CATEGORY_ARTICLE_PAGE_SIZE } from '@/constants';

const PROFILES_PAGE_SIZE = 10;
const ARTICLES_PAGE_SIZE = 10;
const ARTICLES_PER_PROFILE = 5;
const ARTICLE_COUNT_PER_CATEGORY = 10;

function sortedIds(ids?: string[]): string[] | null {
	return ids ? [...ids].sort() : null;
}

type ProfilesParams = {
	categoryIds?: string[];
};

type ArticlesParams = {
	categoryIds?: string[];
	onlyWithoutProfile?: boolean;
	profileId?: string;
	dateFrom?: string;
	templateId?: string;
	includeInitial?: boolean;
};

type CategoryArticlesParams = {
	categoryId: string;
};

type CategoryPageEntry = {
	categoryName: string;
	articles: ArticleWithTasks[];
	/** Next page offset (articles loaded so far, including deduped pages). */
	offset: number;
	hasMore: boolean;
	loading: boolean;
};

class ArticleCacheStore {
	private readonly profiles = new PaginationResource<ArticleProfile, ProfilesParams>(
		PROFILES_PAGE_SIZE,
		(params) => JSON.stringify({ categoryIds: sortedIds(params.categoryIds), kind: 'profile' }),
		async (params, offset, limit) => {
			const items = await getProfiles({
				categoryIds: params.categoryIds,
				offset,
				limit,
				includeArticles: true,
				articleCount: ARTICLES_PER_PROFILE,
				kind: 'profile'
			});

			return { items };
		}
	);

	private readonly domains = new PaginationResource<ArticleProfile, ProfilesParams>(
		PROFILES_PAGE_SIZE,
		(params) => JSON.stringify({ categoryIds: sortedIds(params.categoryIds), kind: 'domain' }),
		async (params, offset, limit) => {
			const items = await getProfiles({
				categoryIds: params.categoryIds,
				offset,
				limit,
				includeArticles: true,
				articleCount: ARTICLES_PER_PROFILE,
				kind: 'domain'
			});

			return { items };
		}
	);

	private readonly articles = new PaginationResource<ArticleWithTasks, ArticlesParams>(
		ARTICLES_PAGE_SIZE,
		(params) =>
			JSON.stringify({
				categoryIds: sortedIds(params.categoryIds),
				onlyWithoutProfile: params.onlyWithoutProfile ?? null,
				profileId: params.profileId ?? null,
				dateFrom: params.dateFrom ?? null,
				templateId: params.templateId ?? null,
				includeInitial: params.includeInitial ?? null
			}),
		async (params, offset, limit) => {
			const result = await getArticlesWithoutProfile({
				categoryIds: params.categoryIds,
				offset,
				limit,
				onlyWithoutProfile: params.onlyWithoutProfile,
				profileId: params.profileId,
				dateFrom: params.dateFrom,
				templateId: params.templateId,
				includeInitial: params.includeInitial
			});

			return { items: result.articles, total: result.total };
		}
	);

	private readonly categoryArticlesResource = new PaginationResource<
		ArticleWithTasks,
		CategoryArticlesParams
	>(
		ARTICLES_PAGE_SIZE,
		(params) => JSON.stringify({ categoryId: params.categoryId }),
		async (params, offset, limit) => {
			const result = await getArticlesWithoutProfile({
				categoryIds: [params.categoryId],
				offset,
				limit,
				onlyWithoutProfile: false
			});

			return { items: result.articles, total: result.total };
		}
	);

	// Per-category article paging (CategoriesTab wheel). Unlike the resources
	// above, one batched invoke carries the offset of every category that needs
	// a page, so several card sentinels can be served by a single round-trip.
	// Reactive through SvelteMap internals: always mutate in place (set/clear),
	// never reassign this field or readers of the old instance stop tracking.
	private categoryPages = new SvelteMap<string, CategoryPageEntry>();
	private categoryPagesLoading = $state(false);
	private categoryPagesStale = true;
	private categoryPagesSignature: string | null = null;
	private categoryPagesCreatedAtFrom: number | undefined = undefined;
	private categoryPagesFetchId = 0;

	get profilesWithArticles(): ArticleProfile[] {
		return this.profiles.items;
	}

	get loadingProfiles(): boolean {
		return this.profiles.loading;
	}

	get hasMoreProfiles(): boolean {
		return this.profiles.hasMore;
	}

	get profilesOffset(): number {
		return this.profiles.offset;
	}

	get domainsWithArticles(): ArticleProfile[] {
		return this.domains.items;
	}

	get loadingDomains(): boolean {
		return this.domains.loading;
	}

	get hasMoreDomains(): boolean {
		return this.domains.hasMore;
	}

	get domainsOffset(): number {
		return this.domains.offset;
	}

	get articlesWithoutProfile(): ArticleWithTasks[] {
		return this.articles.items;
	}

	get totalArticlesWithoutProfile(): number {
		return this.articles.total;
	}

	get loadingArticles(): boolean {
		return this.articles.loading;
	}

	get hasMoreArticles(): boolean {
		return this.articles.hasMore;
	}

	get articlesOffset(): number {
		return this.articles.offset;
	}

	get categoriesWithArticles(): CategoryWithArticles[] {
		const pages: CategoryWithArticles[] = [];
		for (const [categoryId, entry] of this.categoryPages) {
			pages.push({
				categoryId,
				categoryName: entry.categoryName,
				articles: entry.articles
			});
		}
		return pages;
	}

	get loadingCategories(): boolean {
		return this.categoryPagesLoading;
	}

	categoryArticlesFor(categoryId: string): ArticleWithTasks[] {
		return this.categoryPages.get(categoryId)?.articles ?? [];
	}

	hasMoreCategoryArticlesFor(categoryId: string): boolean {
		return this.categoryPages.get(categoryId)?.hasMore ?? false;
	}

	loadingCategoryArticlesFor(categoryId: string): boolean {
		return this.categoryPages.get(categoryId)?.loading ?? false;
	}

	get categoryArticles(): ArticleWithTasks[] {
		return this.categoryArticlesResource.items;
	}

	get loadingCategoryArticles(): boolean {
		return this.categoryArticlesResource.loading;
	}

	get hasMoreCategoryArticles(): boolean {
		return this.categoryArticlesResource.hasMore;
	}

	get categoryArticlesOffset(): number {
		return this.categoryArticlesResource.offset;
	}

	async fetchProfilesWithArticles(options?: {
		force?: boolean;
		loadMore?: boolean;
		categoryIds?: string[];
	}) {
		await this.profiles.fetch(
			{ categoryIds: options?.categoryIds },
			{ force: options?.force, loadMore: options?.loadMore }
		);
	}

	async fetchArticlesWithoutProfile(options?: {
		force?: boolean;
		loadMore?: boolean;
		categoryIds?: string[];
		onlyWithoutProfile?: boolean;
		profileId?: string;
		dateFrom?: string;
		templateId?: string;
		includeInitial?: boolean;
	}) {
		await this.articles.fetch(
			{
				categoryIds: options?.categoryIds,
				onlyWithoutProfile: options?.onlyWithoutProfile,
				profileId: options?.profileId,
				dateFrom: options?.dateFrom,
				templateId: options?.templateId,
				includeInitial: options?.includeInitial
			},
			{ force: options?.force, loadMore: options?.loadMore }
		);
	}

	async fetchDomainsWithArticles(options?: {
		force?: boolean;
		loadMore?: boolean;
		categoryIds?: string[];
	}) {
		await this.domains.fetch(
			{ categoryIds: options?.categoryIds },
			{ force: options?.force, loadMore: options?.loadMore }
		);
	}

	async loadMoreProfiles() {
		await this.profiles.loadMore();
	}

	async loadMoreDomains() {
		await this.domains.loadMore();
	}

	async loadMoreArticles() {
		await this.articles.loadMore();
	}

	async fetchArticlesByCategory(
		categoryId: string,
		options?: { force?: boolean; loadMore?: boolean }
	) {
		await this.categoryArticlesResource.fetch(
			{ categoryId },
			{ force: options?.force, loadMore: options?.loadMore }
		);
	}

	async loadMoreCategoryArticles() {
		await this.categoryArticlesResource.loadMore();
	}

	async fetchCategoriesWithArticles(options?: {
		force?: boolean;
		categoryIds?: string[];
		createdAtFrom?: number;
	}) {
		const categoryIds = options?.categoryIds ?? [];
		const createdAtFrom = options?.createdAtFrom ?? this.categoryPagesCreatedAtFrom;
		const signature = JSON.stringify({
			categoryIds: sortedIds(categoryIds),
			createdAtFrom: createdAtFrom ?? null
		});

		if (!options?.force && !this.categoryPagesStale && signature === this.categoryPagesSignature) {
			return;
		}

		// A null categoryId resolves every non-deleted category server-side.
		const queries: CategoryArticlesQuery[] =
			categoryIds.length > 0
				? categoryIds.map((categoryId) => ({
						categoryId,
						offset: 0,
						articleCount: ARTICLE_COUNT_PER_CATEGORY
					}))
				: [{ categoryId: null, offset: 0, articleCount: ARTICLE_COUNT_PER_CATEGORY }];

		const fetchId = ++this.categoryPagesFetchId;
		this.categoryPagesLoading = true;
		try {
			const pages = await getArticlesByCategories({
				queries,
				createdAtFrom: createdAtFrom ?? null
			});
			if (fetchId !== this.categoryPagesFetchId) {
				return;
			}

			// Mutate the map in place: SvelteMap reactivity is per-instance, so
			// reassigning the field would never invalidate readers that tracked
			// the previous instance (cards stayed blank after the first fetch).
			this.categoryPages.clear();
			for (const page of pages) {
				this.categoryPages.set(page.categoryId, {
					categoryName: page.categoryName,
					articles: page.articles,
					offset: page.articles.length,
					hasMore: page.hasMore,
					loading: false
				});
			}
			this.categoryPagesCreatedAtFrom = createdAtFrom;
			this.categoryPagesSignature = signature;
			this.categoryPagesStale = false;
		} finally {
			if (fetchId === this.categoryPagesFetchId) {
				this.categoryPagesLoading = false;
			}
		}
	}

	async loadMoreCategoryArticlesFor(categoryId: string): Promise<void> {
		const entry = this.categoryPages.get(categoryId);
		if (!entry || entry.loading || !entry.hasMore) return;

		this.categoryPages.set(categoryId, { ...entry, loading: true });
		try {
			const pages = await getArticlesByCategories({
				queries: [
					{
						categoryId,
						offset: entry.offset,
						articleCount: CATEGORY_ARTICLE_PAGE_SIZE
					}
				],
				// Keep the initial fetch's cutoff so pages stay consistent.
				createdAtFrom: this.categoryPagesCreatedAtFrom ?? null
			});
			const page = pages.find((candidate) => candidate.categoryId === categoryId);
			if (!page) return;

			const current = this.categoryPages.get(categoryId);
			if (!current) return;

			const knownUrls = new Set(current.articles.map((article) => article.url ?? ''));
			const appended = page.articles.filter((article) => !knownUrls.has(article.url ?? ''));
			this.categoryPages.set(categoryId, {
				...current,
				articles: [...current.articles, ...appended],
				offset: current.offset + page.articles.length,
				hasMore: page.hasMore,
				loading: false
			});
		} catch (error) {
			const current = this.categoryPages.get(categoryId);
			if (current) {
				this.categoryPages.set(categoryId, { ...current, loading: false });
			}
			throw error;
		}
	}

	invalidate() {
		this.profiles.invalidate();
		this.domains.invalidate();
		this.articles.invalidate();
		this.categoryPagesStale = true;
		this.categoryArticlesResource.invalidate();
	}

	invalidateCategories() {
		this.categoryPagesStale = true;
	}

	invalidateProfiles() {
		this.profiles.invalidate();
		this.domains.invalidate();
	}

	invalidateDomains() {
		this.domains.invalidate();
	}

	invalidateCategoryArticles() {
		this.categoryArticlesResource.invalidate();
	}

	invalidateArticles() {
		this.articles.invalidate();
	}

	removeArticlesByUrls(urls: Set<string>) {
		if (urls.size === 0) return;

		const hasUrl = (article: ArticleWithTasks) => urls.has(article.url ?? '');

		const removedArticles = this.articles.remove(hasUrl);
		this.articles.total = Math.max(0, this.articles.total - removedArticles);
		this.articles.offset = this.articles.items.length;
		this.articles.hasMore = this.articles.offset < this.articles.total;

		this.categoryArticlesResource.remove(hasUrl);
		this.categoryArticlesResource.offset = this.categoryArticlesResource.items.length;

		const filterProfileArticles = (items: ArticleProfile[]) =>
			items
				.map((profile) => {
					const originalCount = profile.articles?.length ?? 0;
					const filteredArticles = profile.articles?.filter((article) => !hasUrl(article));
					const removedFromProfile = originalCount - (filteredArticles?.length ?? 0);

					return {
						...profile,
						articles: filteredArticles,
						count:
							typeof profile.count === 'number'
								? Math.max(0, profile.count - removedFromProfile)
								: profile.count
					};
				})
				.filter((profile) => profile.count === undefined || profile.count > 0);

		this.profiles.replace(filterProfileArticles);
		this.domains.replace(filterProfileArticles);

		// Collect pruned entries first, then mutate in place — SvelteMap must
		// not be replaced (its reactivity is per-instance) nor mutated while
		// being iterated.
		const pruned: Array<[string, CategoryPageEntry]> = [];
		for (const [categoryId, entry] of this.categoryPages) {
			const articles = entry.articles.filter((article) => !hasUrl(article));
			if (articles.length !== entry.articles.length) {
				pruned.push([categoryId, { ...entry, articles }]);
			}
		}
		for (const [categoryId, entry] of pruned) {
			this.categoryPages.set(categoryId, entry);
		}

		this.profiles.invalidate();
		this.domains.invalidate();
		this.categoryPagesStale = true;
	}
}

export const articleCacheStore = new ArticleCacheStore();
