import {
	getArticlesWithProfiles,
	getArticlesWithoutProfile,
	type ArticleWithTasks,
	type ProfileWithArticles
} from '@/stores/webStore';

const CACHE_TTL = 60_000;
const PROFILES_PAGE_SIZE = 20;
const ARTICLES_PAGE_SIZE = 20;
const ARTICLE_COUNT_PER_PROFILE = 10;

class ArticleCacheStore {
	profilesWithArticles = $state<ProfileWithArticles[]>([]);
	articlesWithoutProfile = $state<ArticleWithTasks[]>([]);
	totalArticlesWithoutProfile = $state(0);

	loadingProfiles = $state(false);
	loadingArticles = $state(false);

	profilesOffset = $state(0);
	hasMoreProfiles = $state(true);

	articlesOffset = $state(0);
	hasMoreArticles = $state(true);

	private profilesFetchedAt = 0;
	private articlesFetchedAt = 0;
	private profilesFetchId = 0;
	private articlesFetchId = 0;
	private articlesProfileId: string | undefined = undefined;
	private articlesDateFrom: string | undefined = undefined;

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
			const offset = options?.loadMore ? this.profilesOffset : 0;
			const result = await getArticlesWithProfiles(ARTICLE_COUNT_PER_PROFILE, {
				offset,
				limit: PROFILES_PAGE_SIZE,
				categoryIds: options?.categoryIds
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
		}

		const fetchId = ++this.articlesFetchId;
		this.loadingArticles = true;
		try {
			const offset = options?.loadMore ? this.articlesOffset : 0;
			const result = await getArticlesWithoutProfile({
				categoryIds: options?.categoryIds,
				offset,
				limit: ARTICLES_PAGE_SIZE,
				onlyWithoutProfile: options?.onlyWithoutProfile,
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

	invalidate() {
		this.profilesFetchedAt = 0;
		this.articlesFetchedAt = 0;
		this.profilesOffset = 0;
		this.articlesOffset = 0;
		this.profilesWithArticles = [];
		this.articlesWithoutProfile = [];
		this.hasMoreProfiles = true;
		this.hasMoreArticles = true;
	}

	invalidateProfiles() {
		this.profilesFetchedAt = 0;
		this.profilesOffset = 0;
		this.profilesWithArticles = [];
		this.hasMoreProfiles = true;
	}

	invalidateArticles() {
		this.articlesFetchedAt = 0;
		this.articlesOffset = 0;
		this.articlesWithoutProfile = [];
		this.totalArticlesWithoutProfile = 0;
		this.hasMoreArticles = true;
		this.articlesProfileId = undefined;
		this.articlesDateFrom = undefined;
	}
}

export const articleCacheStore = new ArticleCacheStore();
