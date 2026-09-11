import {
	getArticlesByCategories,
	getArticlesWithoutProfile,
	getProfiles,
	type ArticleWithTasks,
	type ArticleProfile,
	type CategoryWithArticles
} from '@/stores/webStore';

const PROFILES_PAGE_SIZE = 20;
const ARTICLES_PAGE_SIZE = 20;
const ARTICLES_PER_PROFILE = 5;
const ARTICLE_COUNT_PER_CATEGORY = 20;

function sortedIds(ids?: string[]): string[] | null {
	return ids ? [...ids].sort() : null;
}

class ArticleCacheStore {
	profilesWithArticles = $state<ArticleProfile[]>([]);
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

	private profilesStale = true;
	private articlesStale = true;
	private categoriesStale = true;
	private categoryArticlesStale = true;

	private profilesSignature: string | null = null;
	private articlesSignature: string | null = null;
	private categoriesSignature: string | null = null;
	private categoryArticlesSignature: string | null = null;

	private profilesFetchId = 0;
	private articlesFetchId = 0;
	private categoriesFetchId = 0;
	private categoryArticlesFetchId = 0;

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
		if (options?.loadMore) {
			const fetchId = ++this.profilesFetchId;
			this.loadingProfiles = true;
			try {
				const offset = this.profilesOffset;
				const result = await getProfiles({
					categoryIds: this.profilesCategoryIds,
					offset,
					limit: PROFILES_PAGE_SIZE,
					includeArticles: true,
					articleCount: ARTICLES_PER_PROFILE
				});

				if (fetchId !== this.profilesFetchId) {
					return;
				}

				this.profilesWithArticles = [...this.profilesWithArticles, ...result];
				this.profilesOffset = offset + result.length;
				this.hasMoreProfiles = result.length >= PROFILES_PAGE_SIZE;
				this.profilesStale = false;
			} finally {
				if (fetchId === this.profilesFetchId) {
					this.loadingProfiles = false;
				}
			}
			return;
		}

		const categoryIds = options?.categoryIds;
		const signature = JSON.stringify({ categoryIds: sortedIds(categoryIds) });
		if (!options?.force && !this.profilesStale && signature === this.profilesSignature) {
			return;
		}

		const fetchId = ++this.profilesFetchId;
		this.loadingProfiles = true;
		try {
			const result = await getProfiles({
				categoryIds,
				offset: 0,
				limit: PROFILES_PAGE_SIZE,
				includeArticles: true,
				articleCount: ARTICLES_PER_PROFILE
			});

			if (fetchId !== this.profilesFetchId) {
				return;
			}

			this.profilesCategoryIds = categoryIds;
			this.profilesWithArticles = result;
			this.profilesOffset = result.length;
			this.hasMoreProfiles = result.length >= PROFILES_PAGE_SIZE;
			this.profilesSignature = signature;
			this.profilesStale = false;
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
		if (options?.loadMore) {
			const fetchId = ++this.articlesFetchId;
			this.loadingArticles = true;
			try {
				const offset = this.articlesOffset;
				const result = await getArticlesWithoutProfile({
					categoryIds: this.articlesCategoryIds,
					offset,
					limit: ARTICLES_PAGE_SIZE,
					onlyWithoutProfile: this.articlesOnlyWithoutProfile,
					profileId: this.articlesProfileId,
					dateFrom: this.articlesDateFrom
				});

				if (fetchId !== this.articlesFetchId) {
					return;
				}

				this.articlesWithoutProfile = [...this.articlesWithoutProfile, ...result.articles];
				this.totalArticlesWithoutProfile = result.total;
				this.articlesOffset = offset + result.articles.length;
				this.hasMoreArticles = this.articlesOffset < result.total;
				this.articlesStale = false;
			} finally {
				if (fetchId === this.articlesFetchId) {
					this.loadingArticles = false;
				}
			}
			return;
		}

		const signature = JSON.stringify({
			categoryIds: sortedIds(options?.categoryIds),
			onlyWithoutProfile: options?.onlyWithoutProfile ?? null,
			profileId: options?.profileId ?? null,
			dateFrom: options?.dateFrom ?? null
		});
		if (!options?.force && !this.articlesStale && signature === this.articlesSignature) {
			return;
		}

		const fetchId = ++this.articlesFetchId;
		this.loadingArticles = true;
		try {
			const result = await getArticlesWithoutProfile({
				categoryIds: options?.categoryIds,
				offset: 0,
				limit: ARTICLES_PAGE_SIZE,
				onlyWithoutProfile: options?.onlyWithoutProfile,
				profileId: options?.profileId,
				dateFrom: options?.dateFrom
			});

			if (fetchId !== this.articlesFetchId) {
				return;
			}

			this.articlesProfileId = options?.profileId;
			this.articlesDateFrom = options?.dateFrom;
			this.articlesCategoryIds = options?.categoryIds;
			this.articlesOnlyWithoutProfile = options?.onlyWithoutProfile;
			this.articlesWithoutProfile = result.articles;
			this.totalArticlesWithoutProfile = result.total;
			this.articlesOffset = result.articles.length;
			this.hasMoreArticles = this.articlesOffset < result.total;
			this.articlesSignature = signature;
			this.articlesStale = false;
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
		if (options?.loadMore) {
			const fetchId = ++this.categoryArticlesFetchId;
			this.loadingCategoryArticles = true;
			try {
				const offset = this.categoryArticlesOffset;
				const result = await getArticlesWithoutProfile({
					categoryIds: [this.categoryArticleCategoryId!],
					offset,
					limit: ARTICLES_PAGE_SIZE,
					onlyWithoutProfile: false
				});

				if (fetchId !== this.categoryArticlesFetchId) {
					return;
				}

				this.categoryArticles = [...this.categoryArticles, ...result.articles];
				this.categoryArticlesOffset = offset + result.articles.length;
				this.hasMoreCategoryArticles = this.categoryArticlesOffset < result.total;
				this.categoryArticlesStale = false;
			} finally {
				if (fetchId === this.categoryArticlesFetchId) {
					this.loadingCategoryArticles = false;
				}
			}
			return;
		}

		const signature = JSON.stringify({ categoryId });
		if (
			!options?.force &&
			!this.categoryArticlesStale &&
			signature === this.categoryArticlesSignature
		) {
			return;
		}

		const fetchId = ++this.categoryArticlesFetchId;
		this.loadingCategoryArticles = true;
		try {
			const result = await getArticlesWithoutProfile({
				categoryIds: [categoryId],
				offset: 0,
				limit: ARTICLES_PAGE_SIZE,
				onlyWithoutProfile: false
			});

			if (fetchId !== this.categoryArticlesFetchId) {
				return;
			}

			this.categoryArticleCategoryId = categoryId;
			this.categoryArticles = result.articles;
			this.categoryArticlesOffset = result.articles.length;
			this.hasMoreCategoryArticles = this.categoryArticlesOffset < result.total;
			this.categoryArticlesSignature = signature;
			this.categoryArticlesStale = false;
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
		const categoryIds = options?.categoryIds ?? this.categoriesCategoryIds ?? [];
		const createdAtFrom = options?.createdAtFrom ?? this.categoriesCreatedAtFrom;
		const signature = JSON.stringify({
			categoryIds: sortedIds(categoryIds),
			createdAtFrom: createdAtFrom ?? null
		});
		if (!options?.force && !this.categoriesStale && signature === this.categoriesSignature) {
			return;
		}

		const fetchId = ++this.categoriesFetchId;
		this.loadingCategories = true;
		try {
			const result = await getArticlesByCategories(
				categoryIds,
				ARTICLE_COUNT_PER_CATEGORY,
				createdAtFrom
			);

			if (fetchId !== this.categoriesFetchId) {
				return;
			}

			this.categoriesCategoryIds = categoryIds;
			this.categoriesCreatedAtFrom = createdAtFrom;
			this.categoriesWithArticles = result;
			this.categoriesSignature = signature;
			this.categoriesStale = false;
		} finally {
			if (fetchId === this.categoriesFetchId) {
				this.loadingCategories = false;
			}
		}
	}

	invalidate() {
		this.profilesStale = true;
		this.articlesStale = true;
		this.categoriesStale = true;
		this.categoryArticlesStale = true;
	}

	invalidateCategories() {
		this.categoriesStale = true;
	}

	invalidateProfiles() {
		this.profilesStale = true;
	}

	invalidateCategoryArticles() {
		this.categoryArticlesStale = true;
	}

	invalidateArticles() {
		this.articlesStale = true;
	}

	removeArticlesByUrls(urls: Set<string>) {
		if (urls.size === 0) return;
		const beforeArticles = this.articlesWithoutProfile.length;
		this.articlesWithoutProfile = this.articlesWithoutProfile.filter((a) => !urls.has(a.url ?? ''));
		const removedArticles = beforeArticles - this.articlesWithoutProfile.length;
		this.totalArticlesWithoutProfile = Math.max(
			0,
			this.totalArticlesWithoutProfile - removedArticles
		);
		this.articlesOffset = this.articlesWithoutProfile.length;
		this.hasMoreArticles = this.articlesOffset < this.totalArticlesWithoutProfile;

		this.categoryArticles = this.categoryArticles.filter((a) => !urls.has(a.url ?? ''));
		this.categoryArticlesOffset = this.categoryArticles.length;

		this.profilesWithArticles = this.profilesWithArticles
			.map((profile) => {
				const originalCount = profile.articles?.length ?? 0;
				const filteredArticles = profile.articles?.filter((a) => !urls.has(a.url ?? ''));
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

		this.categoriesWithArticles = this.categoriesWithArticles.map((cat) => ({
			...cat,
			articles: cat.articles.filter((a) => !urls.has(a.url ?? ''))
		}));

		this.profilesStale = true;
		this.categoriesStale = true;
	}
}

export const articleCacheStore = new ArticleCacheStore();
