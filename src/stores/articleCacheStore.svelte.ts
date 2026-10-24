import {
	getArticlesByCategories,
	getArticlesWithoutProfile,
	getCategoriesWithArticlesPage,
	getProfiles,
	type ArticleRecord,
	type ArticleProfile,
	type CategoryWithArticles
} from '@/stores/webStore';
import { PaginationResource } from '@/stores/paginationResource.svelte';
import { SvelteMap } from 'svelte/reactivity';
import { TAB_PAGE_CONFIG, type CardLayout } from '@/constants';
import { articleCapacity } from '@/lib/utils/cardLayout';
import { viewState } from '@/stores/viewStore.svelte';
import type { ArticleMode } from '@/types/articleAnalysis.types';

const PROFILES_PAGE_SIZE = TAB_PAGE_CONFIG.profiles.pageSize;
const DOMAINS_PAGE_SIZE = TAB_PAGE_CONFIG.domains.pageSize;
const ARTICLES_PAGE_SIZE = TAB_PAGE_CONFIG.articles.pageSize;
const CATEGORIES_PAGE_SIZE = TAB_PAGE_CONFIG.categories.pageSize;

function sortedIds(ids?: string[]): string[] | null {
	return ids ? [...ids].sort() : null;
}

type ProfilesParams = {
	categoryIds?: string[];
	/**
	 * Card layout bound to this fetch. Carried in the signature so changing
	 * the layout settles a refetch through the existing resource machinery.
	 */
	card: CardLayout;
};

type ArticlesParams = {
	categoryIds?: string[];
	onlyWithoutProfile?: boolean;
	profileId?: string;
	profileIds?: string[];
	domainIds?: string[];
	dateFrom?: string;
	/** `metadata` restricts the list to captured-but-not-analysed articles. */
	mode?: ArticleMode;
};

type CategoryArticlesParams = {
	categoryId: string;
};

type CategoryPageEntry = {
	categoryName: string;
	articles: ArticleRecord[];
};

function buildArticlesSignature(params: ArticlesParams): string {
	return JSON.stringify({
		categoryIds: sortedIds(params.categoryIds),
		onlyWithoutProfile: params.onlyWithoutProfile ?? null,
		profileId: params.profileId ?? null,
		profileIds: sortedIds(params.profileIds),
		domainIds: sortedIds(params.domainIds),
		dateFrom: params.dateFrom ?? null,
		mode: params.mode ?? null
	});
}

async function fetchArticlesPage(
	params: ArticlesParams,
	offset: number,
	limit: number
): Promise<{ items: ArticleRecord[]; total: number }> {
	const result = await getArticlesWithoutProfile({
		categoryIds: params.categoryIds,
		offset,
		limit,
		onlyWithoutProfile: params.onlyWithoutProfile,
		profileId: params.profileId,
		profileIds: params.profileIds,
		domainIds: params.domainIds,
		dateFrom: params.dateFrom,
		mode: params.mode
	});

	return { items: result.articles, total: result.total };
}

class ArticleCacheStore {
	private readonly profiles = new PaginationResource<ArticleProfile, ProfilesParams>(
		PROFILES_PAGE_SIZE,
		(params) =>
			JSON.stringify({
				categoryIds: sortedIds(params.categoryIds),
				card: params.card,
				kind: 'profile'
			}),
		async (params, offset, limit) => {
			const items = await getProfiles({
				categoryIds: params.categoryIds,
				offset,
				limit,
				includeArticles: true,
				articleCount: articleCapacity(params.card.columns, params.card.rows),
				kind: 'profile'
			});

			return { items };
		}
	);

	private readonly domains = new PaginationResource<ArticleProfile, ProfilesParams>(
		DOMAINS_PAGE_SIZE,
		(params) =>
			JSON.stringify({
				categoryIds: sortedIds(params.categoryIds),
				card: params.card,
				kind: 'domain'
			}),
		async (params, offset, limit) => {
			const items = await getProfiles({
				categoryIds: params.categoryIds,
				offset,
				limit,
				includeArticles: true,
				articleCount: articleCapacity(params.card.columns, params.card.rows),
				kind: 'domain'
			});

			return { items };
		}
	);

	private readonly articles = new PaginationResource<ArticleRecord, ArticlesParams>(
		ARTICLES_PAGE_SIZE,
		buildArticlesSignature,
		fetchArticlesPage
	);

	private readonly categoryArticlesResource = new PaginationResource<
		ArticleRecord,
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

	// Per-profile article lists, cached independently of the shared `articles`
	// resource so a profile visit never evicts/overwrites the ArticlesTab page
	// (visiting a profile used to change the shared signature, forcing the tab
	// to hard-refetch on return: the grid emptied and the masonry remeasured
	// everything). Keyed by normalized profile id so page.params and the
	// scrapStore's normalized handle land on the same entry.
	private readonly profileArticlesResources = new SvelteMap<
		string,
		PaginationResource<ArticleRecord, ArticlesParams>
	>();

	private profileResourceKey(profileId: string): string {
		return profileId.trim().toLowerCase();
	}

	private getOrCreateProfileResource(
		profileId: string
	): PaginationResource<ArticleRecord, ArticlesParams> {
		const key = this.profileResourceKey(profileId);
		let resource = this.profileArticlesResources.get(key);
		if (!resource) {
			resource = new PaginationResource<ArticleRecord, ArticlesParams>(
				ARTICLES_PAGE_SIZE,
				buildArticlesSignature,
				fetchArticlesPage
			);
			this.profileArticlesResources.set(key, resource);
		}
		return resource;
	}

	private profileResource(
		profileId: string
	): PaginationResource<ArticleRecord, ArticlesParams> | undefined {
		return this.profileArticlesResources.get(this.profileResourceKey(profileId));
	}

	// Category catalog paging (CategoriesTab wheel). The wheel paginates cards,
	// not the articles inside a card: each page carries a bounded number of
	// categories, each with a fixed number of embedded articles. Ordering and
	// the "has articles" filter live server-side so pages never overlap.
	// Reactive through SvelteMap internals: always mutate in place (set/clear),
	// never reassign this field or readers of the old instance stop tracking.
	private categoryPages = new SvelteMap<string, CategoryPageEntry>();
	private categoryPagesLoading = $state(false);
	private categoryPagesStale = true;
	private categoryPagesSignature: string | null = null;
	private categoryPagesCreatedAtFrom: number | undefined = undefined;
	private categoryPagesCard: CardLayout | undefined = undefined;
	private categoryPagesFetchId = 0;
	private categoryOffset = 0;
	private categoryHasMore = $state(true);

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

	get articlesWithoutProfile(): ArticleRecord[] {
		return this.articles.visibleItems;
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

	get hasMoreCategories(): boolean {
		return this.categoryHasMore;
	}

	get categoryArticles(): ArticleRecord[] {
		return this.categoryArticlesResource.visibleItems;
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
		card?: CardLayout;
	}) {
		await this.profiles.fetch(
			{ categoryIds: options?.categoryIds, card: options?.card ?? viewState.cardLayout.profiles },
			{ force: options?.force, loadMore: options?.loadMore }
		);
	}

	async fetchArticlesWithoutProfile(options?: {
		force?: boolean;
		loadMore?: boolean;
		categoryIds?: string[];
		onlyWithoutProfile?: boolean;
		profileId?: string;
		profileIds?: string[];
		domainIds?: string[];
		dateFrom?: string;
		mode?: ArticleMode;
	}) {
		await this.articles.fetch(
			{
				categoryIds: options?.categoryIds,
				onlyWithoutProfile: options?.onlyWithoutProfile,
				profileId: options?.profileId,
				profileIds: options?.profileIds,
				domainIds: options?.domainIds,
				dateFrom: options?.dateFrom,
				mode: options?.mode
			},
			{ force: options?.force, loadMore: options?.loadMore }
		);
	}

	/** Fetches the paginated article list of one profile into its own cache. */
	async fetchProfileArticles(profileId: string, options?: { force?: boolean; mode?: ArticleMode }) {
		await this.getOrCreateProfileResource(profileId).fetch(
			{
				profileId,
				mode: options?.mode
			},
			{ force: options?.force }
		);
	}

	/** Articles of one profile from its per-profile cache (empty until fetched). */
	profileArticles(profileId: string): ArticleRecord[] {
		return this.profileResource(profileId)?.visibleItems ?? [];
	}

	loadingProfileArticles(profileId: string): boolean {
		return this.profileResource(profileId)?.loading ?? false;
	}

	hasMoreProfileArticles(profileId: string): boolean {
		return this.profileResource(profileId)?.hasMore ?? false;
	}

	async loadMoreProfileArticles(profileId: string): Promise<void> {
		await this.profileResource(profileId)?.loadMore();
	}

	async fetchDomainsWithArticles(options?: {
		force?: boolean;
		loadMore?: boolean;
		categoryIds?: string[];
		card?: CardLayout;
	}) {
		await this.domains.fetch(
			{ categoryIds: options?.categoryIds, card: options?.card ?? viewState.cardLayout.domains },
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
		card?: CardLayout;
	}) {
		const categoryIds = options?.categoryIds ?? [];
		const card = options?.card ?? viewState.cardLayout.categories;
		const createdAtFrom = options?.createdAtFrom ?? this.categoryPagesCreatedAtFrom;
		const signature = JSON.stringify({
			categoryIds: sortedIds(categoryIds),
			createdAtFrom: createdAtFrom ?? null,
			card
		});

		if (!options?.force && !this.categoryPagesStale && signature === this.categoryPagesSignature) {
			return;
		}

		const fetchId = ++this.categoryPagesFetchId;
		this.categoryPagesLoading = true;
		try {
			if (categoryIds.length > 0) {
				// Explicit category ids: one page per id, no catalog paging.
				const pages = await getArticlesByCategories({
					queries: categoryIds.map((categoryId) => ({
						categoryId,
						offset: 0,
						articleCount: articleCapacity(card.columns, card.rows)
					})),
					createdAtFrom: createdAtFrom ?? null
				});
				if (fetchId !== this.categoryPagesFetchId) return;

				this.categoryPages.clear();
				for (const page of pages) {
					this.categoryPages.set(page.categoryId, {
						categoryName: page.categoryName,
						articles: page.articles
					});
				}
				this.categoryOffset = this.categoryPages.size;
				this.categoryHasMore = false;
			} else {
				const page = await getCategoriesWithArticlesPage({
					offset: 0,
					limit: CATEGORIES_PAGE_SIZE,
					articleCount: articleCapacity(card.columns, card.rows),
					createdAtFrom: createdAtFrom ?? null
				});
				if (fetchId !== this.categoryPagesFetchId) return;

				// Mutate the map in place: SvelteMap reactivity is per-instance, so
				// reassigning the field would never invalidate readers that tracked
				// the previous instance (cards stayed blank after the first fetch).
				this.categoryPages.clear();
				for (const category of page.categories) {
					this.categoryPages.set(category.categoryId, {
						categoryName: category.categoryName,
						articles: category.articles
					});
				}
				this.categoryOffset = page.categories.length;
				this.categoryHasMore = page.hasMore;
			}

			this.categoryPagesCreatedAtFrom = createdAtFrom;
			this.categoryPagesCard = card;
			this.categoryPagesSignature = signature;
			this.categoryPagesStale = false;
		} catch (error) {
			// Keep last-known-good data and do not touch categoryPagesSignature /
			// categoryPagesStale: stamping either would make the guard at the top
			// of this method short-circuit retries and permanently show stale or
			// empty categories. The next call retries the fetch instead.
			console.error('Failed to fetch categories with articles:', error);
		} finally {
			if (fetchId === this.categoryPagesFetchId) {
				this.categoryPagesLoading = false;
			}
		}
	}

	async loadMoreCategories(): Promise<void> {
		if (!this.categoryHasMore || this.categoryPagesLoading) return;

		const fetchId = ++this.categoryPagesFetchId;
		this.categoryPagesLoading = true;
		try {
			// Continue with the layout the catalog was fetched with so appended
			// pages stay consistent until the next full refetch.
			const card = this.categoryPagesCard ?? viewState.cardLayout.categories;
			const page = await getCategoriesWithArticlesPage({
				offset: this.categoryOffset,
				limit: CATEGORIES_PAGE_SIZE,
				articleCount: articleCapacity(card.columns, card.rows),
				// Keep the initial fetch's cutoff so pages stay consistent.
				createdAtFrom: this.categoryPagesCreatedAtFrom
			});
			if (fetchId !== this.categoryPagesFetchId) return;

			for (const category of page.categories) {
				if (this.categoryPages.has(category.categoryId)) continue;
				this.categoryPages.set(category.categoryId, {
					categoryName: category.categoryName,
					articles: category.articles
				});
			}
			this.categoryOffset += page.categories.length;
			this.categoryHasMore = page.hasMore;
		} catch (error) {
			// Keep categoryOffset / categoryHasMore untouched so a retry picks up
			// at the same offset instead of treating the failure as the end of
			// pagination.
			console.error('Failed to load more categories:', error);
		} finally {
			if (fetchId === this.categoryPagesFetchId) {
				this.categoryPagesLoading = false;
			}
		}
	}

	invalidate() {
		this.profiles.invalidate();
		this.domains.invalidate();
		this.articles.invalidate();
		for (const resource of this.profileArticlesResources.values()) {
			resource.invalidate();
		}
		this.categoryPagesStale = true;
		this.categoryArticlesResource.invalidate();
	}

	/**
	 * Repaints every list that already holds data once the run queue drains.
	 *
	 * Runs only mark the lists stale, so nothing on screen would otherwise
	 * refetch the rows (and thumbnails) the runs just wrote. Each loaded
	 * window is re-queried as-is instead of through `fetch({ force })`, which
	 * always starts at page one and would collapse a scrolled list back to a
	 * single page. Lists with nothing loaded stay stale and fetch on demand.
	 */
	async refreshAfterRuns(): Promise<void> {
		await Promise.all([
			this.profiles.refreshLoaded(),
			this.domains.refreshLoaded(),
			this.articles.refreshLoaded(),
			this.categoryArticlesResource.refreshLoaded(),
			...[...this.profileArticlesResources.values()].map((resource) => resource.refreshLoaded()),
			this.refreshLoadedCategoryPages()
		]);
	}

	/**
	 * Same window refresh for the categories wheel: its cards embed article
	 * thumbnails, so it repaints with the rest. Categories are the pagination
	 * unit here, so the loaded count is the window.
	 */
	private async refreshLoadedCategoryPages(): Promise<void> {
		const loadedCategories = this.categoryOffset;
		if (loadedCategories === 0) {
			this.categoryPagesStale = true;
			return;
		}

		const card = this.categoryPagesCard ?? viewState.cardLayout.categories;
		// Not claiming the resource (no `fetchId` bump): a background repaint
		// must never strand an in-flight fetch's `categoryPagesLoading` flag.
		const startedFetchId = this.categoryPagesFetchId;
		try {
			const page = await getCategoriesWithArticlesPage({
				offset: 0,
				limit: loadedCategories,
				articleCount: articleCapacity(card.columns, card.rows),
				// Keep the cutoff the loaded window was fetched with.
				createdAtFrom: this.categoryPagesCreatedAtFrom
			});
			if (startedFetchId !== this.categoryPagesFetchId) {
				return;
			}
			// Same safety as the list resources: an empty answer for a non-empty
			// window is a failed query, so the cards on screen are kept.
			if (page.categories.length === 0) {
				return;
			}

			// Mutate the map in place: SvelteMap reactivity is per-instance, so
			// reassigning the field never invalidates readers of the old one.
			this.categoryPages.clear();
			for (const category of page.categories) {
				this.categoryPages.set(category.categoryId, {
					categoryName: category.categoryName,
					articles: category.articles
				});
			}
			this.categoryOffset = page.categories.length;
			this.categoryHasMore = page.hasMore;
			this.categoryPagesStale = false;
		} catch (error) {
			// Keep the last-known-good cards and retry on the next repaint.
			console.error('Failed to refresh category cards:', error);
			this.categoryPagesStale = true;
		}
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

		const hasUrl = (article: ArticleRecord) => urls.has(article.url ?? '');

		const removedArticles = this.articles.remove(hasUrl);
		this.articles.total = Math.max(0, this.articles.total - removedArticles);
		this.articles.offset = this.articles.items.length;
		this.articles.hasMore = this.articles.offset < this.articles.total;

		// Prune every cached per-profile list too, keeping each resource's
		// pagination counters consistent so its next loadMore stays aligned.
		for (const resource of this.profileArticlesResources.values()) {
			const removedFromProfile = resource.remove(hasUrl);
			resource.total = Math.max(0, resource.total - removedFromProfile);
			resource.offset = resource.items.length;
			resource.hasMore = resource.offset < resource.total;
		}

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
		// Mirror the server-side catalog filter: a category whose last loaded
		// article was removed drops out of the wheel instead of rendering an
		// empty "No articles" card until the next refetch.
		const pruned: Array<[string, CategoryPageEntry]> = [];
		const emptied: string[] = [];
		for (const [categoryId, entry] of this.categoryPages) {
			const articles = entry.articles.filter((article) => !hasUrl(article));
			if (articles.length === entry.articles.length) continue;
			if (articles.length === 0) {
				emptied.push(categoryId);
				continue;
			}
			pruned.push([categoryId, { ...entry, articles }]);
		}
		for (const categoryId of emptied) {
			this.categoryPages.delete(categoryId);
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
