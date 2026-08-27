import {
	getArticlesByCategories,
	getArticlesWithProfiles,
	getArticlesWithoutProfile,
	type ArticleWithTasks,
	type CategoryWithArticles,
	type ProfileWithArticles
} from '@/stores/webStore';

const CACHE_TTL = 60_000;
const PROFILES_PAGE_SIZE = 20;
const ARTICLES_PAGE_SIZE = 20;
const ARTICLE_COUNT_PER_PROFILE = 10;
const ARTICLE_COUNT_PER_CATEGORY = 20;

class ArticleCacheStore {
	profilesWithArticles = $state<ProfileWithArticles[]>([]);
	articlesWithoutProfile = $state<ArticleWithTasks[]>([]);
	categoriesWithArticles = $state<CategoryWithArticles[]>([]);
	totalArticlesWithoutProfile = $state(0);

	loadingProfiles = $state(false);
	loadingArticles = $state(false);
	loadingCategories = $state(false);

	profilesOffset = $state(0);
	hasMoreProfiles = $state(true);

	articlesOffset = $state(0);
	hasMoreArticles = $state(true);

	categoryArticles = $state<ArticleWithTasks[]>([]);
	loadingCategoryArticles = $state(false);
	hasMoreCategoryArticles = $state(true);
	categoryArticlesOffset = $state(0);

	private profilesFetchedAt = 0;
	private articlesFetchedAt = 0;
	private categoriesFetchedAt = 0;
	private profilesFetchId = 0;
	private articlesFetchId = 0;
	private categoriesFetchId = 0;
	private categoryArticlesFetchId = 0;
	private categoryArticlesFetchedAt = 0;
	private categoryArticleCategoryId: string | undefined = undefined;
	private articlesProfileId: string | undefined = undefined;
	private articlesDateFrom: string | undefined = undefined;
	private articlesCategoryIds: string[] | undefined = undefined;
	private articlesOnlyWithoutProfile: boolean | undefined = undefined;
	private profilesCategoryIds: string[] | undefined = undefined;
	private categoriesCategoryIds: string[] | undefined = undefined;
	private categoriesCreatedAtFrom: number | undefined = undefined;

	async fetchProfilesWithArticles(options?: {
		force?: boolean;
		loadMore?: boolean;
		categoryIds?: string[];
	}) {
		const now = Date.now();
		if (!options?.force && !options?.loadMore && now - this.profilesFetchedAt < CACHE_TTL) {
			return;
		}

		const fetchId = ++this.profilesFetchId;
		this.loadingProfiles = true;
		try {
			if (!options?.loadMore) {
				this.profilesCategoryIds = options?.categoryIds;
			}
			const offset = options?.loadMore ? this.profilesOffset : 0;
			const result = await getArticlesWithProfiles(ARTICLE_COUNT_PER_PROFILE, {
				offset,
				limit: PROFILES_PAGE_SIZE,
				categoryIds: options?.loadMore ? this.profilesCategoryIds : options?.categoryIds
			});

			if (fetchId !== this.profilesFetchId) {
				return;
			}

			if (options?.loadMore) {
				this.profilesWithArticles = [...this.profilesWithArticles, ...result];
			} else {
				this.profilesWithArticles = result;
			}

			this.profilesOffset = offset + result.length;
			this.hasMoreProfiles = result.length >= PROFILES_PAGE_SIZE;
			this.profilesFetchedAt = Date.now();
		} finally {
			if (fetchId === this.profilesFetchId) {
				this.loadingProfiles = false;
			}
		}
	}

	async fetchArticlesWithoutProfile(options?: {
		force?: boolean;
		loadMore?: boolean;
		categoryIds?: string[];
		onlyWithoutProfile?: boolean;
		profileId?: string;
		dateFrom?: string;
	}) {
		const now = Date.now();
		if (!options?.force && !options?.loadMore && now - this.articlesFetchedAt < CACHE_TTL) {
			return;
		}

		if (!options?.loadMore) {
			this.articlesProfileId = options?.profileId;
			this.articlesDateFrom = options?.dateFrom;
			this.articlesCategoryIds = options?.categoryIds;
			this.articlesOnlyWithoutProfile = options?.onlyWithoutProfile;
		}

		const fetchId = ++this.articlesFetchId;
		this.loadingArticles = true;
		try {
			const offset = options?.loadMore ? this.articlesOffset : 0;
			const result = await getArticlesWithoutProfile({
				categoryIds: options?.loadMore ? this.articlesCategoryIds : options?.categoryIds,
				offset,
				limit: ARTICLES_PAGE_SIZE,
				onlyWithoutProfile: options?.loadMore
					? this.articlesOnlyWithoutProfile
					: options?.onlyWithoutProfile,
				profileId: options?.loadMore ? this.articlesProfileId : options?.profileId,
				dateFrom: options?.loadMore ? this.articlesDateFrom : options?.dateFrom
			});

			if (fetchId !== this.articlesFetchId) {
				return;
			}

			if (options?.loadMore) {
				this.articlesWithoutProfile = [...this.articlesWithoutProfile, ...result.articles];
			} else {
				this.articlesWithoutProfile = result.articles;
			}

			this.totalArticlesWithoutProfile = result.total;
			this.articlesOffset = offset + result.articles.length;
			this.hasMoreArticles = this.articlesOffset < result.total;
			this.articlesFetchedAt = Date.now();
		} finally {
			if (fetchId === this.articlesFetchId) {
				this.loadingArticles = false;
			}
		}
	}

	async loadMoreProfiles() {
		if (!this.hasMoreProfiles || this.loadingProfiles) return;
		await this.fetchProfilesWithArticles({ loadMore: true });
	}

	async loadMoreArticles() {
		if (!this.hasMoreArticles || this.loadingArticles) return;
		await this.fetchArticlesWithoutProfile({ loadMore: true });
	}

	async fetchArticlesByCategory(
		categoryId: string,
		options?: { force?: boolean; loadMore?: boolean }
	) {
		const now = Date.now();
		if (!options?.force && !options?.loadMore && now - this.categoryArticlesFetchedAt < CACHE_TTL) {
			return;
		}

		if (!options?.loadMore) {
			this.categoryArticleCategoryId = categoryId;
		}

		const fetchId = ++this.categoryArticlesFetchId;
		this.loadingCategoryArticles = true;
		try {
			const offset = options?.loadMore ? this.categoryArticlesOffset : 0;
			const result = await getArticlesWithoutProfile({
				categoryIds: [options?.loadMore ? this.categoryArticleCategoryId! : categoryId],
				offset,
				limit: ARTICLES_PAGE_SIZE,
				onlyWithoutProfile: false
			});

			if (fetchId !== this.categoryArticlesFetchId) {
				return;
			}

			if (options?.loadMore) {
				this.categoryArticles = [...this.categoryArticles, ...result.articles];
			} else {
				this.categoryArticles = result.articles;
			}

			this.categoryArticlesOffset = offset + result.articles.length;
			this.hasMoreCategoryArticles = this.categoryArticlesOffset < result.total;
			this.categoryArticlesFetchedAt = Date.now();
		} finally {
			if (fetchId === this.categoryArticlesFetchId) {
				this.loadingCategoryArticles = false;
			}
		}
	}

	async loadMoreCategoryArticles() {
		if (!this.hasMoreCategoryArticles || this.loadingCategoryArticles) return;
		await this.fetchArticlesByCategory(this.categoryArticleCategoryId!, { loadMore: true });
	}

	async fetchCategoriesWithArticles(options?: {
		force?: boolean;
		categoryIds?: string[];
		createdAtFrom?: number;
	}) {
		const now = Date.now();
		if (!options?.force && now - this.categoriesFetchedAt < CACHE_TTL) {
			return;
		}

		const categoryIds = options?.categoryIds ?? this.categoriesCategoryIds ?? [];
		this.categoriesCategoryIds = categoryIds;
		this.categoriesCreatedAtFrom = options?.createdAtFrom ?? this.categoriesCreatedAtFrom;

		const fetchId = ++this.categoriesFetchId;
		this.loadingCategories = true;
		try {
			const result = await getArticlesByCategories(
				categoryIds,
				ARTICLE_COUNT_PER_CATEGORY,
				this.categoriesCreatedAtFrom
			);

			if (fetchId !== this.categoriesFetchId) {
				return;
			}

			this.categoriesWithArticles = result;
			this.categoriesFetchedAt = Date.now();
		} finally {
			if (fetchId === this.categoriesFetchId) {
				this.loadingCategories = false;
			}
		}
	}

	invalidate() {
		this.profilesFetchedAt = 0;
		this.articlesFetchedAt = 0;
		this.categoriesFetchedAt = 0;
		this.categoryArticlesFetchedAt = 0;
		this.profilesOffset = 0;
		this.articlesOffset = 0;
		this.categoryArticlesOffset = 0;
		this.profilesWithArticles = [];
		this.articlesWithoutProfile = [];
		this.categoriesWithArticles = [];
		this.categoryArticles = [];
		this.hasMoreProfiles = true;
		this.hasMoreArticles = true;
		this.hasMoreCategoryArticles = true;
		this.profilesCategoryIds = undefined;
		this.categoriesCategoryIds = undefined;
		this.categoriesCreatedAtFrom = undefined;
		this.categoryArticleCategoryId = undefined;
	}

	invalidateCategories() {
		this.categoriesFetchedAt = 0;
		this.categoriesWithArticles = [];
		this.categoriesCategoryIds = undefined;
		this.categoriesCreatedAtFrom = undefined;
	}

	invalidateProfiles() {
		this.profilesFetchedAt = 0;
		this.profilesOffset = 0;
		this.profilesWithArticles = [];
		this.hasMoreProfiles = true;
		this.profilesCategoryIds = undefined;
	}

	invalidateCategoryArticles() {
		this.categoryArticlesFetchedAt = 0;
		this.categoryArticlesOffset = 0;
		this.categoryArticles = [];
		this.hasMoreCategoryArticles = true;
		this.categoryArticleCategoryId = undefined;
	}

	invalidateArticles() {
		this.articlesFetchedAt = 0;
		this.articlesOffset = 0;
		this.articlesWithoutProfile = [];
		this.totalArticlesWithoutProfile = 0;
		this.hasMoreArticles = true;
		this.articlesProfileId = undefined;
		this.articlesDateFrom = undefined;
		this.articlesCategoryIds = undefined;
		this.articlesOnlyWithoutProfile = undefined;
	}
}

export const articleCacheStore = new ArticleCacheStore();
