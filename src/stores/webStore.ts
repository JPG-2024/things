import { invoke } from '@tauri-apps/api/core';
import { getMediaSrc, isResolvedMediaSrc } from '@/lib/utils/files';
import type { ArticleMode, ArticleWindow } from '@/types/articleAnalysis.types';

export interface ArticleRecord {
	id: string;
	url: string | null;
	title: string | null;
	thumbnail: string | null;
	thumbnailSrc?: string | null;
	content?: string | null;
	mediaDirectory?: string | null;
	/** Alias of `mediaDirectory`, kept for the callers that use the short name. */
	directory?: string | null;
	profileId?: string | null;
	/** Ride on the spread WebStoreArticleRecord; used by facet post-filtering. */
	profile?: string | null;
	domain?: string | null;
	/** Rides on the spread WebStoreArticleRecord; list rows always carry it. */
	createdAt?: number;
	profilePicture?: string | null;
	profilePictureSrc?: string | null;
	primaryColor?: string | null;
	mainColor?: string | null;
	date?: string | null;
	/** Combined summary of the window analysis. */
	summary?: string | null;
	/** Window divisor that was actually executed; `null` = split by headings. */
	analysisDivisor?: number | null;
	/** `full` = analysed, `metadata` = captured but pending analysis. */
	mode?: ArticleMode | null;
	viewed?: boolean | null;
	[key: string]: unknown;
}

export interface ArticlesWithoutProfileResponse {
	articles: ArticleRecord[];
	total: number;
}

export interface CategoryWithArticles {
	categoryId: string;
	categoryName: string;
	articles: ArticleRecord[];
}
export const WEB_STORE_UNKNOWN_PROFILE_ID = '__unknown_profile__';
export const WEB_STORE_UNKNOWN_PROFILE_LABEL = 'Unknown profile';
//div[contains(concat(" ", normalize-space(@class), " "), " hp-hero-title_wrapper ")]/div[contains(concat(" ", normalize-space(@class), " "), " t-body-large ")]
export interface ArticleProfile {
	id: string;
	name: string;
	count?: number;
	domainId?: string | null;
	profilePicture?: string | null;
	profilePictureSrc?: string | null;
	url?: string | null;
	mostRecentCreatedAt?: number | null;
	articles?: ArticleRecord[];
}

export interface WebStoreDomainRecord {
	id: string;
	name: string;
	count: number;
	profilePicture: string | null;
	url: string | null;
	mostRecentCreatedAt: number | null;
	articles?: WebStoreArticleRecord[] | null;
}

export interface WebStoreProfileRecord {
	id: string;
	name: string;
	domainId: string;
	count: number;
	profilePicture: string | null;
	url: string | null;
	mostRecentCreatedAt: number | null;
	articles?: WebStoreArticleRecord[] | null;
}

export type WebStoreArticleRecord = {
	id: string;
	url: string | null;
	createdAt: number;
	title: string | null;
	thumbnail: string | null;
	/** Only present on the article-detail fetch; list queries omit these
	 * heavyweight columns to keep bodies out of webview memory. */
	content?: string | null;
	directory: string | null;
	mediaDirectory: string | null;
	profile: string | null;
	domain: string | null;
	mainColor: string | null;
	primaryColor: string | null;
	updatedAt: number;
	embeddingSourceText?: string | null;
	profilePicture: string | null;
	viewed: boolean;
	date: string | null;
	/** Combined summary of the window analysis. */
	summary: string | null;
	/** Window divisor that was actually executed; `null` = split by headings. */
	analysisDivisor: number | null;
	/** `full` = analysed, `metadata` = captured but pending analysis. */
	mode: ArticleMode | null;
};

export type WebStoreProfileDeletion = {
	success: boolean;
	deletedCount: number;
};

export type WebStoreCategoryRecord = {
	id: string;
	name: string;
	description?: string | null;
	lastModified: number;
	deletedAt: number | null;
};

export type UpsertWebStoreCategoryInput = {
	id: string;
	name: string;
	description?: string | null;
};

export type WebStoreCategoryExemplarRecord = {
	id: string;
	categoryId: string;
	articleUrl: string;
	articleTitle?: string | null;
	text: string;
	modelName?: string | null;
	modelDimensions?: number | null;
	createdAt: number;
	updatedAt: number;
};

export type UpsertCategoryExemplarInput = {
	categoryId: string;
	articleUrl: string;
	text: string;
	modelName?: string | null;
	modelDimensions?: number | null;
};

export type CategoryExemplarModelStatus = {
	total: number;
	matching: number;
};

export type AssignCategoriesToArticleInput = {
	articleUrl: string;
	categoryIds: string[];
};

export type AssignCategoriesToProfileInput = {
	profileId: string;
	categoryIds: string[];
};

type UpsertWebStoreArticleInput = {
	url: string;
	title: string | null;
	thumbnail: string | null;
	directory: string | null;
	mainColor: string | null;
	profile: string | null;
	embeddingSourceText: string | null;
	date: string | null;
	/** `full` | `metadata`. */
	mode: ArticleMode | null;
};

let _cachedProfiles: ArticleProfile[] | null = null;
let _pendingProfilesPromise: Promise<ArticleProfile[]> | null = null;
/** Full-list cache for the `kind`-only `getProfiles` variant (filters popup:
 * every profile, or every domain). Any other option bypasses it. */
const _cachedProfilesByKind = new Map<'profile' | 'domain', ArticleProfile[]>();
const _pendingProfilesByKind = new Map<'profile' | 'domain', Promise<ArticleProfile[]>>();

export type ArticleFieldOverrides = {
	title?: string | null;
	thumbnail?: string | null;
	directory?: string | null;
	mainColor?: string | null;
	profile?: string | null;
	date?: string | null;
	/** `full` | `metadata`. */
	mode?: ArticleMode;
};

export function normalizeNullableString(value: string | null | undefined): string | null {
	if (typeof value !== 'string') {
		return null;
	}

	const normalized = value.trim();
	return normalized.length > 0 ? normalized : null;
}

/** First non-empty string of the list, trimmed. */
export function firstNormalizedString(...values: Array<string | null | undefined>): string | null {
	for (const value of values) {
		const normalized = normalizeNullableString(value);
		if (normalized) {
			return normalized;
		}
	}

	return null;
}

/**
 * Builds the upsert payload of an article from flat fields.
 *
 * The pipeline no longer goes through tasks: every value is either produced
 * by the runner or already stored on the article row.
 */
function buildUpsertInput(params: {
	url: string;
	values?: ArticleFieldOverrides | undefined;
	existingArticle?: ArticleRecord | null;
}): UpsertWebStoreArticleInput {
	const existing = params.existingArticle ?? null;

	const title = firstNormalizedString(params.values?.title, existing?.title);
	const thumbnail = firstNormalizedString(params.values?.thumbnail, existing?.thumbnail);
	const directory = firstNormalizedString(
		params.values?.directory,
		existing?.mediaDirectory,
		existing?.directory
	);
	const mainColor = firstNormalizedString(
		params.values?.mainColor,
		existing?.mainColor,
		existing?.primaryColor
	);
	const profile = firstNormalizedString(params.values?.profile, existing?.profile);
	const date = firstNormalizedString(params.values?.date, existing?.date);

	// The mode is sticky: an upsert without an explicit mode never clears the
	// `full` flag written by `save_article_analysis`.
	const mode = params.values?.mode ?? existing?.mode ?? null;

	// The embedding source text is the text the category classifier compares
	// against, so it is kept in sync with the title and the summary.
	const existingSummary = typeof existing?.summary === 'string' ? existing.summary : null;
	const embeddingSourceText = firstNormalizedString(title, existingSummary);

	return {
		url: params.url,
		title,
		thumbnail,
		directory,
		mainColor,
		profile,
		embeddingSourceText,
		date,
		mode
	};
}

function mapStoredArticle(row: WebStoreArticleRecord): ArticleRecord {
	return {
		...row,
		profilePicture: row.profilePicture,
		profileId: row.profile
	};
}

async function resolveMediaSrc<T extends object, K extends string>(
	item: T,
	field: keyof T & string,
	srcField: K,
	setWhenUnresolved: boolean
): Promise<T & { [P in K]?: string | null }> {
	const raw = (item as Record<string, unknown>)[field];

	// Any already-resolved src (URL, dev `/@fs/...` path) is used as-is.
	if (
		typeof raw === 'string' &&
		raw.length > 0 &&
		!raw.includes('://') &&
		!isResolvedMediaSrc(raw)
	) {
		const resolved = await getMediaSrc(raw);
		return { ...item, [srcField]: resolved } as T & { [P in K]?: string | null };
	}

	if (setWhenUnresolved) {
		return { ...item, [srcField]: typeof raw === 'string' ? raw : null } as T & {
			[P in K]?: string | null;
		};
	}

	return item as T & { [P in K]?: string | null };
}

async function resolveMediaSrcBatch<T extends object, K extends string>(
	items: T[],
	field: keyof T & string,
	srcField: K,
	setWhenUnresolved: boolean
): Promise<(T & { [P in K]?: string | null })[]> {
	return Promise.all(
		items.map((item) => resolveMediaSrc(item, field, srcField, setWhenUnresolved))
	);
}

async function resolveArticleThumbnail(article: ArticleRecord): Promise<ArticleRecord> {
	return resolveMediaSrc(article, 'thumbnail', 'thumbnailSrc', false);
}

async function resolveArticleThumbnailBatch(articles: ArticleRecord[]): Promise<ArticleRecord[]> {
	return resolveMediaSrcBatch(articles, 'thumbnail', 'thumbnailSrc', false);
}

async function resolveArticleProfilePictureBatch(
	articles: ArticleRecord[]
): Promise<ArticleRecord[]> {
	return resolveMediaSrcBatch(articles, 'profilePicture', 'profilePictureSrc', true);
}

async function resolveProfilePictureField<T extends { profilePicture?: string | null }>(
	profile: T
): Promise<T & { profilePictureSrc?: string | null }> {
	return resolveMediaSrc(profile, 'profilePicture', 'profilePictureSrc', true);
}

async function resolveProfilePictureBatch<T extends { profilePicture?: string | null }>(
	profiles: T[]
): Promise<(T & { profilePictureSrc?: string | null })[]> {
	return Promise.all(profiles.map(resolveProfilePictureField));
}

/**
 * Maps article rows for list contexts. Rows carry no tasks JSON here: list
 * items only need the row fields (title, thumbnail, colors...), so
 * `persistedTasks` stays empty and no per-article IPC happens (see IPC-1/2 in
 * docs/perf-plan-bottlenecks.md). Detail paths use `mapStoredArticle` with the
 * row's own tasks JSON + `{ hydrateRawContent: true }` instead.
 */
async function mapAndResolveArticles(rows: WebStoreArticleRecord[]): Promise<ArticleRecord[]> {
	const mappedArticles = await Promise.all(rows.map((row) => mapStoredArticle(row)));

	return resolveArticleProfilePictureBatch(await resolveArticleThumbnailBatch(mappedArticles));
}

export async function mapArticlesFromRecords(
	rows: WebStoreArticleRecord[]
): Promise<ArticleRecord[]> {
	if (rows.length === 0) {
		return [];
	}

	return mapAndResolveArticles(rows);
}

export async function getArticles(): Promise<ArticleRecord[]> {
	try {
		const articles = await invoke<WebStoreArticleRecord[]>('list_web_store_articles');

		return mapAndResolveArticles(articles);
	} catch (error) {
		console.error('Error querying DB articles', error);
		return [];
	}
}

export function isDomainId(id: string): boolean {
	return !id.includes('@') && /^[\w-]+(\.[\w-]+)+$/.test(id);
}

export function normalizeDomainId(value: string): string {
	return value.toLowerCase().replace(/\s+/g, '-');
}

function domainRecordToArticleProfile(record: WebStoreDomainRecord): ArticleProfile {
	return {
		id: record.id,
		name: record.name,
		count: record.count,
		domainId: record.id,
		profilePicture: record.profilePicture,
		url: record.url,
		mostRecentCreatedAt: record.mostRecentCreatedAt,
		articles: record.articles ?? undefined
	};
}

function profileRecordToArticleProfile(record: WebStoreProfileRecord): ArticleProfile {
	return {
		id: record.id,
		name: record.name,
		count: record.count,
		domainId: record.domainId,
		profilePicture: record.profilePicture,
		url: record.url,
		mostRecentCreatedAt: record.mostRecentCreatedAt,
		articles: record.articles ?? undefined
	};
}

interface ProfilesOptions {
	categoryIds?: string[];
	createdAtFrom?: number;
	includeArticles?: boolean;
	articleCount?: number;
	offset?: number;
	limit?: number;
	kind?: 'domain' | 'profile';
}

/** True when `kind` is the only option — the full-list variant served from the
 * per-kind cache. Combination calls (paging, filters, articles) never cache. */
function isKindOnly(options: ProfilesOptions): options is { kind: 'profile' | 'domain' } {
	return (
		options.kind !== undefined &&
		options.categoryIds === undefined &&
		options.createdAtFrom === undefined &&
		options.includeArticles === undefined &&
		options.articleCount === undefined &&
		options.offset === undefined &&
		options.limit === undefined
	);
}

export async function getProfiles(options?: ProfilesOptions): Promise<ArticleProfile[]> {
	if (!options && _cachedProfiles) return _cachedProfiles;
	if (!options && _pendingProfilesPromise) return _pendingProfilesPromise;

	const fetchProfiles = async (): Promise<ArticleProfile[]> => {
		type RawProfileCard = WebStoreDomainRecord | WebStoreProfileRecord;
		type ResolvedProfileCard = RawProfileCard & { profilePictureSrc?: string | null };
		try {
			const kind = options?.kind;
			const [domains, profiles] = await Promise.all([
				kind === 'profile'
					? Promise.resolve([])
					: invoke<WebStoreDomainRecord[]>('list_web_store_domains', {
							categoryIds: options?.categoryIds ?? null,
							createdAtFrom: options?.createdAtFrom ?? null,
							includeArticles: options?.includeArticles ?? null,
							articleCount: options?.articleCount ?? null,
							offset: options?.offset ?? null,
							limit: options?.limit ?? null
						}),
				kind === 'domain'
					? Promise.resolve([])
					: invoke<WebStoreProfileRecord[]>('list_web_store_profiles', {
							domainId: null,
							categoryIds: options?.categoryIds ?? null,
							includeArticles: options?.includeArticles ?? null,
							articleCount: options?.articleCount ?? null,
							offset: options?.offset ?? null,
							limit: options?.limit ?? null
						})
			]);

			const resolvedCards = await resolveProfilePictureBatch<RawProfileCard>([
				...domains,
				...profiles
			]);

			const cardToArticleProfile = (card: ResolvedProfileCard): ArticleProfile => ({
				...('domainId' in card
					? profileRecordToArticleProfile(card)
					: domainRecordToArticleProfile(card)),
				profilePictureSrc: card.profilePictureSrc ?? null
			});

			if (!options?.includeArticles) {
				return resolvedCards.map(cardToArticleProfile);
			}

			const profilesWithArticles: ArticleProfile[] = [];
			for (const card of resolvedCards) {
				let articles: ArticleRecord[] | undefined;
				if (card.articles) {
					articles = await mapAndResolveArticles(card.articles);
				}
				profilesWithArticles.push({ ...cardToArticleProfile(card), articles });
			}

			return profilesWithArticles;
		} catch (error) {
			console.error('Error querying article profiles', error);
			return [];
		}
	};

	if (!options) {
		_pendingProfilesPromise = fetchProfiles();
		try {
			const result = await _pendingProfilesPromise;
			_cachedProfiles = result;
			return result;
		} finally {
			_pendingProfilesPromise = null;
		}
	}

	if (isKindOnly(options)) {
		const kind = options.kind;
		const cached = _cachedProfilesByKind.get(kind);
		if (cached) return cached;
		const pending = _pendingProfilesByKind.get(kind);
		if (pending) return pending;
		const promise = fetchProfiles().then((items) => {
			_cachedProfilesByKind.set(kind, items);
			return items;
		});
		_pendingProfilesByKind.set(kind, promise);
		return promise.finally(() => {
			_pendingProfilesByKind.delete(kind);
		});
	}

	return fetchProfiles();
}

export function invalidateProfilesCache(): void {
	_cachedProfiles = null;
	_pendingProfilesPromise = null;
	_cachedProfilesByKind.clear();
	_pendingProfilesByKind.clear();
}

export async function getProfile(profileId: string): Promise<ArticleProfile | null> {
	try {
		const domain = await invoke<WebStoreDomainRecord | null>('get_web_store_domain', {
			domainId: profileId
		});
		if (domain) {
			return resolveProfilePictureField(domainRecordToArticleProfile(domain));
		}

		const profile = await invoke<WebStoreProfileRecord | null>('get_web_store_profile', {
			profileId
		});
		if (!profile) {
			return null;
		}

		return resolveProfilePictureField(profileRecordToArticleProfile(profile));
	} catch (error) {
		console.error('Error querying profile', error);
		return null;
	}
}

/** Reads the article row of an url, with thumbnail and profile picture srcs resolved. */
export async function getArticleByUrl(url: string): Promise<ArticleRecord | null> {
	try {
		const row = await invoke<WebStoreArticleRecord | null>('get_web_store_article_by_url', { url });
		if (!row) {
			return null;
		}

		return resolveProfilePictureField(
			await resolveArticleThumbnail(mapStoredArticle(row))
		);
	} catch (error) {
		console.error('Error querying article', error);
		return null;
	}
}

/** Reads the category ids linked to an article. */
export async function getArticleCategories(url: string): Promise<string[]> {
	try {
		return await invoke<string[]>('get_article_categories', { articleUrl: url });
	} catch (error) {
		console.error(`Error querying categories of article "${url}"`, error);
		return [];
	}
}

/** The analysis of an article as it is stored. */
export interface StoredArticleAnalysis {
	url: string;
	summary: string | null;
	/** The divisor that was actually executed; `null` = split by headings. */
	divisor: number | null;
	mode: ArticleMode | null;
	windows: ArticleWindow[];
}

type RawArticleAnalysisRecord = {
	url: string;
	summary: string | null;
	divisor: number | null;
	mode: string | null;
	windows: Array<{
		id: string;
		articleUrl: string;
		windowIndex: number;
		startOffset: number;
		endOffset: number;
		payload: string;
	}>;
};

function parseWindowPayload(payload: string): Record<string, unknown> {
	try {
		const parsed = JSON.parse(payload) as unknown;
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
			return parsed as Record<string, unknown>;
		}
	} catch (error) {
		console.warn('[webStore] unable to parse window payload', error);
	}
	return { summary: '' };
}

/**
 * Reads the analysis of an article: the combined summary and every window.
 *
 * One round trip, one JSON.parse per window (at most a handful of small
 * objects).
 */
export async function getArticleAnalysis(url: string): Promise<StoredArticleAnalysis | null> {
	try {
		const record = await invoke<RawArticleAnalysisRecord | null>('get_article_analysis', { url });
		if (!record) return null;

		const windows: ArticleWindow[] = record.windows.map((window) => ({
			index: window.windowIndex,
			start: window.startOffset,
			end: window.endOffset,
			data: parseWindowPayload(window.payload) as ArticleWindow['data']
		}));

		return {
			url: record.url,
			summary: record.summary,
			divisor: record.divisor,
			mode: (record.mode as ArticleMode | null) ?? null,
			windows
		};
	} catch (error) {
		console.error('Error querying article analysis', error);
		return null;
	}
}

/**
 * Persists the analysis of an article: the windows are replaced, the summary
 * and the executed divisor are stored, and the article is flagged as `full`.
 */
export async function saveArticleAnalysis(params: {
	url: string;
	summary: string | null;
	divisor: number | null;
	windows: ArticleWindow[];
}): Promise<void> {
	try {
		await invoke('save_article_analysis', {
			input: {
				url: params.url,
				summary: params.summary,
				divisor: params.divisor,
				windows: params.windows.map((window) => ({
					windowIndex: window.index,
					startOffset: window.start,
					endOffset: window.end,
					payload: JSON.stringify(window.data ?? { summary: '' })
				}))
			}
		});
	} catch (error) {
		console.error(`Error saving article analysis (url='${params.url}'):`, error);
	}
}

/**
 * Resolved thumbnail URL by article URL, memoized per session.
 *
 * Caches the in-flight promise so concurrent callers (e.g. one
 * PillWithEmbeddings instance per topic in the same render) share a single
 * article fetch per URL. Failures resolve to `null` rather than rejecting.
 * The cache does not expire; thumbnails are assumed stable within a session.
 *
 * Deliberately skips tasks entirely: hydrating the content task here would
 * read the full raw content file for every pill URL.
 */
const thumbnailByUrl = new Map<string, Promise<string | null>>();

export function getArticleThumbnailByUrl(url: string): Promise<string | null> {
	let promise = thumbnailByUrl.get(url);
	if (!promise) {
		promise = (async () => {
			try {
				const row = await invoke<WebStoreArticleRecord | null>('get_web_store_article_by_url', {
					url
				});
				if (!row) {
					return null;
				}
				const resolved = await resolveMediaSrc(row, 'thumbnail', 'thumbnailSrc', false);
				return resolved.thumbnailSrc ?? null;
			} catch (error) {
				console.error('Error querying article thumbnail', error);
				return null;
			}
		})();
		thumbnailByUrl.set(url, promise);
	}
	return promise;
}

/**
 * Upserts the row of an article from flat fields.
 *
 * The analysis itself is persisted by `saveArticleAnalysis`; this function
 * only owns the metadata (title, thumbnail, profile, date, mode).
 */
export async function saveArticle(
	url: string,
	values?: ArticleFieldOverrides | undefined,
	existingArticle?: ArticleRecord | null
): Promise<void> {
	let input: UpsertWebStoreArticleInput | undefined;
	try {
		const resolvedExisting =
			existingArticle !== undefined ? existingArticle : await getArticleByUrl(url);
		input = buildUpsertInput({ url, values, existingArticle: resolvedExisting });

		await invoke('upsert_web_store_article', { input });
	} catch (error) {
		console.error(
			`Error upserting article (url='${url}', profile='${input?.profile ?? 'none'}'):`,
			error
		);
	}
}

/**
 * Batch article deletion (IPC-6): one IPC that deletes article rows, task rows,
 * embeddings, raw content files and thumbnails server-side, and rebuilds the
 * domains table once. Returns the number of articles actually deleted; missing
 * urls are tolerated. Errors propagate to the caller.
 */
export async function deleteArticlesByUrls(urls: string[]): Promise<number> {
	return await invoke<number>('delete_web_store_articles_by_urls', { urls });
}

export async function deleteArticleByUrl(url: string): Promise<{ success: boolean }> {
	try {
		await deleteArticlesByUrls([url]);
		return { success: true };
	} catch (error) {
		console.error('Error deleting article from database:', error);
		return { success: false };
	}
}

export async function markArticleAsViewed(url: string): Promise<boolean> {
	try {
		return await invoke<boolean>('update_web_store_article_viewed', {
			url,
			viewed: true
		});
	} catch (error) {
		console.error('Error marking article as viewed:', error);
		return false;
	}
}

export async function deleteProfileById(profileId: string): Promise<WebStoreProfileDeletion> {
	try {
		// Only the branch decision needs the entity record: article rows, their
		// thumbnails and the bucket picture are all cleaned up server-side now
		// (see IPC-5 in docs/perf-plan-bottlenecks.md).
		const profile = await getProfile(profileId);
		const isDomain = profile ? profile.domainId === profile.id : isDomainId(profileId);
		const result = isDomain
			? await invoke<WebStoreProfileDeletion>('delete_web_store_domain', { domainId: profileId })
			: await invoke<WebStoreProfileDeletion>('delete_web_store_profile', { profileId });

		if (result.success) {
			invalidateProfilesCache();
		}

		return result;
	} catch (error) {
		console.error('Error deleting article profile:', error);
		return { success: false, deletedCount: 0 };
	}
}

export async function saveDomain(
	domainId: string,
	profilePicture: string | null,
	url: string | null = null
): Promise<unknown> {
	try {
		const normalizedId = normalizeDomainId(domainId);
		return await invoke('upsert_web_store_domain', {
			input: {
				id: normalizedId,
				name: normalizedId,
				profilePicture,
				url
			}
		});
	} catch (error) {
		console.error('Error saving domain:', error);
	}
}

export async function saveProfile(
	profileId: string,
	profilePicture: string | null,
	url: string | null = null,
	domainId: string | null = null
): Promise<unknown> {
	const normalizedId = normalizeDomainId(profileId);
	const normalizedDomainId = normalizeDomainId(domainId ?? 'youtube.com');

	try {
		let result: unknown;
		if (normalizedId === normalizedDomainId) {
			result = await saveDomain(normalizedId, profilePicture, url);
		} else {
			result = await invoke('upsert_web_store_profile', {
				input: {
					id: normalizedId,
					name: normalizedId,
					domainId: normalizedDomainId,
					profilePicture,
					url
				}
			});
		}
		invalidateProfilesCache();
		return result;
	} catch (error) {
		console.error(
			`Error saving profile (id='${normalizedId}', domainId='${normalizedDomainId}'):`,
			error
		);
	}
}

export type RemoteVideo = {
	url: string;
	title: string;
};

export type RemoteProfile = {
	id: string;
	videos: RemoteVideo[];
	profileImage: string;
};

export const SCRAPY_BASE_URL = import.meta.env.VITE_SCRAPY;

export async function fetchRemoteProfile(profileName: string): Promise<RemoteProfile | null> {
	try {
		return await invoke<RemoteProfile>('fetch_remote_profile', {
			baseUrl: SCRAPY_BASE_URL,
			profileName
		});
	} catch (error) {
		console.error('Error fetching remote profile:', error);
		return null;
	}
}

export async function getCategories(): Promise<WebStoreCategoryRecord[]> {
	try {
		return await invoke<WebStoreCategoryRecord[]>('list_web_store_categories');
	} catch (error) {
		console.error('Error fetching categories:', error);
		return [];
	}
}

export async function saveCategory(input: UpsertWebStoreCategoryInput): Promise<void> {
	try {
		await invoke('upsert_web_store_category', { input });
	} catch (error) {
		console.error('Error saving category:', error);
	}
}

export async function deleteCategory(categoryId: string): Promise<boolean> {
	try {
		return await invoke<boolean>('delete_web_store_category', { categoryId });
	} catch (error) {
		console.error('Error deleting category:', error);
		return false;
	}
}

export async function assignCategoriesToArticle(
	input: AssignCategoriesToArticleInput
): Promise<void> {
	try {
		await invoke('assign_categories_to_article', { input });
	} catch (error) {
		console.error('Error assigning categories to article:', error);
	}
}

/** Reads the category ids linked to a profile (channel or domain). */
export async function getProfileCategories(profileId: string): Promise<string[]> {
	try {
		return await invoke<string[]>('get_profile_categories', { profileId });
	} catch (error) {
		console.error(`Error querying categories of profile "${profileId}"`, error);
		return [];
	}
}

/**
 * Replaces the categories linked to a profile (replace-all). Unlike the
 * article variant this one rejects on failure, so the profile page can
 * resync its optimistic pills (see its change handler).
 */
export async function assignCategoriesToProfile(
	input: AssignCategoriesToProfileInput
): Promise<void> {
	await invoke('assign_categories_to_profile', { input });
}

export async function getCategoryExemplars(
	categoryId: string
): Promise<WebStoreCategoryExemplarRecord[]> {
	try {
		return await invoke<WebStoreCategoryExemplarRecord[]>('list_category_exemplars', {
			categoryId
		});
	} catch (error) {
		console.error('Error fetching category exemplars:', error);
		return [];
	}
}

export async function getAllCategoryExemplars(): Promise<WebStoreCategoryExemplarRecord[]> {
	try {
		return await invoke<WebStoreCategoryExemplarRecord[]>('list_all_category_exemplars');
	} catch (error) {
		console.error('Error fetching all category exemplars:', error);
		return [];
	}
}

export async function saveCategoryExemplar(
	input: UpsertCategoryExemplarInput
): Promise<WebStoreCategoryExemplarRecord | null> {
	try {
		return await invoke<WebStoreCategoryExemplarRecord>('upsert_category_exemplar', { input });
	} catch (error) {
		console.error('Error saving category exemplar:', error);
		return null;
	}
}

export async function deleteCategoryExemplar(exemplarId: string): Promise<boolean> {
	try {
		return await invoke<boolean>('delete_category_exemplar', { id: exemplarId });
	} catch (error) {
		console.error('Error deleting category exemplar:', error);
		return false;
	}
}

export async function getCategoryExemplarModelStatus(params: {
	modelName: string;
	modelDimensions?: number | null;
}): Promise<CategoryExemplarModelStatus> {
	try {
		return await invoke<CategoryExemplarModelStatus>('get_category_exemplar_model_status', {
			modelName: params.modelName,
			modelDimensions: params.modelDimensions ?? null
		});
	} catch (error) {
		console.error('Error fetching category exemplar model status:', error);
		return { total: 0, matching: 0 };
	}
}

export async function updateCategoryExemplarsModel(params: {
	modelName: string;
	modelDimensions?: number | null;
}): Promise<number> {
	try {
		return await invoke<number>('update_category_exemplars_model', {
			modelName: params.modelName,
			modelDimensions: params.modelDimensions ?? null
		});
	} catch (error) {
		console.error('Error updating category exemplar model:', error);
		return 0;
	}
}

export async function getArticlesWithoutProfile(options?: {
	categoryIds?: string[];
	offset?: number;
	limit?: number;
	onlyWithoutProfile?: boolean;
	profileId?: string;
	/** Facet filters: match a.profile / a.domain only (not either-kind). */
	profileIds?: string[];
	domainIds?: string[];
	dateFrom?: string;
	/** `metadata` restricts the list to captured-but-not-analysed articles. */
	mode?: ArticleMode;
}): Promise<ArticlesWithoutProfileResponse> {
	try {
		const result = await invoke<{
			articles: WebStoreArticleRecord[];
			total: number;
		}>('list_articles_without_profile', {
			categoryIds: options?.categoryIds ?? null,
			offset: options?.offset ?? null,
			limit: options?.limit ?? null,
			onlyWithoutProfile: options?.onlyWithoutProfile ?? null,
			profileId: options?.profileId ?? null,
			profileIds: options?.profileIds ?? null,
			domainIds: options?.domainIds ?? null,
			dateFrom: options?.dateFrom ?? null,
			mode: options?.mode ?? null
		});

		const resolvedArticles = await mapAndResolveArticles(result.articles);

		return { articles: resolvedArticles, total: result.total };
	} catch (error) {
		console.error('Error fetching articles without profile:', error);
		return { articles: [], total: 0 };
	}
}

export interface CategoryArticlesQuery {
	/** null resolves every non-deleted category (initial full fetch). */
	categoryId: string | null;
	offset: number;
	articleCount: number;
}

export interface CategoryArticlesPage {
	categoryId: string;
	categoryName: string;
	articles: ArticleRecord[];
	hasMore: boolean;
}

export async function getArticlesByCategories(options: {
	queries: CategoryArticlesQuery[];
	createdAtFrom?: number | null;
}): Promise<CategoryArticlesPage[]> {
	try {
		const result = await invoke<
			Array<{
				categoryId: string;
				categoryName: string;
				articles: WebStoreArticleRecord[];
				hasMore: boolean;
			}>
		>('list_articles_by_categories', {
			queries: options.queries,
			createdAtFrom: options.createdAtFrom ?? null
		});

		const pages: CategoryArticlesPage[] = [];
		for (const page of result) {
			const resolvedArticles = await mapAndResolveArticles(page.articles);

			pages.push({
				categoryId: page.categoryId,
				categoryName: page.categoryName,
				articles: resolvedArticles,
				hasMore: page.hasMore
			});
		}

		return pages;
	} catch (error) {
		console.error('Error fetching articles by categories:', error);
		return [];
	}
}

export interface CategoriesWithArticlesPage {
	categories: CategoryWithArticles[];
	hasMore: boolean;
}

/**
 * Paginated category catalog for the categories wheel. Ordering (most recent
 * article first) and the "has articles" filter are applied server-side so the
 * offset stays consistent across pages.
 */
export async function getCategoriesWithArticlesPage(options?: {
	offset?: number;
	limit?: number;
	articleCount?: number;
	createdAtFrom?: number | null;
}): Promise<CategoriesWithArticlesPage> {
	// Propagates errors: callers must distinguish "no more pages" from a
	// failed fetch, otherwise loadMoreCategories would flip hasMore to false
	// on a transient failure and silently truncate pagination.
	const result = await invoke<{
		categories: Array<{
			categoryId: string;
			categoryName: string;
			articles: WebStoreArticleRecord[];
			hasMore: boolean;
		}>;
		hasMore: boolean;
	}>('list_categories_with_articles', {
		offset: options?.offset ?? null,
		limit: options?.limit ?? null,
		articleCount: options?.articleCount ?? null,
		createdAtFrom: options?.createdAtFrom ?? null
	});

	const categories: CategoryWithArticles[] = [];
	for (const page of result.categories) {
		const resolvedArticles = await mapAndResolveArticles(page.articles);
		categories.push({
			categoryId: page.categoryId,
			categoryName: page.categoryName,
			articles: resolvedArticles
		});
	}

	return { categories, hasMore: result.hasMore };
}
