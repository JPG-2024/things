import {
	getArticlesByCategories,
	getArticlesWithoutProfile,
	getProfiles,
	type ArticleWithTasks,
	type ArticleProfile,
	type CategoryWithArticles
} from '@/stores/webStore';
import { PaginationResource } from '@/stores/paginationResource.svelte';

const PROFILES_PAGE_SIZE = 20;
const ARTICLES_PAGE_SIZE = 20;
const ARTICLES_PER_PROFILE = 5;
const ARTICLE_COUNT_PER_CATEGORY = 20;

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

type CategoriesParams = {
	categoryIds: string[];
	createdAtFrom?: number;
};

class ArticleCacheStore {
	private readonly profiles = new PaginationResource<ArticleProfile, ProfilesParams>(
		PROFILES_PAGE_SIZE,
		(params) => JSON.stringify({ categoryIds: sortedIds(params.categoryIds) }),
		async (params, offset, limit) => {
			const items = await getProfiles({
				categoryIds: params.categoryIds,
				offset,
				limit,
				includeArticles: true,
				articleCount: ARTICLES_PER_PROFILE
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

	private readonly categories = new PaginationResource<CategoryWithArticles, CategoriesParams>(
		ARTICLE_COUNT_PER_CATEGORY,
		(params) =>
			JSON.stringify({
				categoryIds: sortedIds(params.categoryIds),
				createdAtFrom: params.createdAtFrom ?? null
			}),
		async (params, _offset, limit) => {
			const items = await getArticlesByCategories(params.categoryIds, limit, params.createdAtFrom);

			return { items, total: items.length };
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
		return this.categories.items;
	}

	get loadingCategories(): boolean {
		return this.categories.loading;
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

	async loadMoreProfiles() {
		await this.profiles.loadMore();
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
		const categoryIds = options?.categoryIds ?? this.categories.lastParams?.categoryIds ?? [];
		const createdAtFrom = options?.createdAtFrom ?? this.categories.lastParams?.createdAtFrom;

		await this.categories.fetch({ categoryIds, createdAtFrom }, { force: options?.force });
	}

	invalidate() {
		this.profiles.invalidate();
		this.articles.invalidate();
		this.categories.invalidate();
		this.categoryArticlesResource.invalidate();
	}

	invalidateCategories() {
		this.categories.invalidate();
	}

	invalidateProfiles() {
		this.profiles.invalidate();
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

		this.profiles.replace((profiles) =>
			profiles
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
				.filter((profile) => profile.count === undefined || profile.count > 0)
		);

		this.categories.replace((categories) =>
			categories.map((category) => ({
				...category,
				articles: category.articles.filter((article) => !hasUrl(article))
			}))
		);

		this.profiles.invalidate();
		this.categories.invalidate();
	}
}

export const articleCacheStore = new ArticleCacheStore();
