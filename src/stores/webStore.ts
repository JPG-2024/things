import { invoke } from '@tauri-apps/api/core';
import { getMediaSrc, isResolvedMediaSrc } from '@/lib/utils/files';
import type { RecursiveChunk } from '@/runners/shared/recursiveTask';
import { isRealTemplateId } from '@/runners/templateConstants';
import type { Task, TaskMapBase } from '@/types/taskRunner.types';

export type PersistedTaskState = {
	id: string;
	name?: string;
	data?: unknown;
	status?: Task['status'];
	renderOrder?: number;
};

export interface ArticleWithTasks {
	id: string;
	url: string | null;
	title: string | null;
	thumbnail: string | null;
	thumbnailSrc?: string | null;
	content?: string | null;
	mediaDirectory?: string | null;
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
	persistedTasks?: PersistedTaskState[];
	viewed?: boolean | null;
	templateId?: string | null;
	[key: string]: unknown;
}

export interface ArticlesWithoutProfileResponse {
	articles: ArticleWithTasks[];
	total: number;
}

export interface CategoryWithArticles {
	categoryId: string;
	categoryName: string;
	articles: ArticleWithTasks[];
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
	articles?: ArticleWithTasks[];
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
	templateId: string | null;
};

export type WebStoreTaskRecord = {
	url: string;
	tasksJson: string;
	updatedAt: number;
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

type UpsertWebStoreArticleInput = {
	url: string;
	title: string | null;
	thumbnail: string | null;
	directory: string | null;
	mainColor: string | null;
	profile: string | null;
	embeddingSourceText: string | null;
	date: string | null;
	templateId: string | null;
};

type LegacyPageElementItem = {
	name?: unknown;
	textContent?: unknown;
};

let _cachedProfiles: ArticleProfile[] | null = null;
let _pendingProfilesPromise: Promise<ArticleProfile[]> | null = null;
/** Full-list cache for the `kind`-only `getProfiles` variant (filters popup:
 * every profile, or every domain). Any other option bypasses it. */
const _cachedProfilesByKind = new Map<'profile' | 'domain', ArticleProfile[]>();
const _pendingProfilesByKind = new Map<'profile' | 'domain', Promise<ArticleProfile[]>>();

export const RAW_CONTENT_REF = '__rawContentRef__';

type RawContentRef = { [RAW_CONTENT_REF]: string };

function isRawContentRef(value: unknown): value is RawContentRef {
	return (
		typeof value === 'object' &&
		value !== null &&
		typeof (value as RawContentRef)[RAW_CONTENT_REF] === 'string'
	);
}

/**
 * Parses a persisted tasks JSON into task states.
 *
 * Default does **not** hydrate `__rawContentRef__` refs (pure JSON.parse, zero
 * IPC): list mapping only needs the small tasks (`category`, `analysis`, ...),
 * and hydrating full article text on every mapped row reintroduces the N+1
 * `read_raw_content` round-trip plus megabytes of content in webview memory.
 * Detail paths (`getArticleWithTasksByUrl`, `getTasksByUrl`) pass
 * `{ hydrateRawContent: true }` to resolve the raw text explicitly.
 */
export async function parsePersistedTaskStates(
	raw: string | null,
	opts?: { hydrateRawContent?: boolean }
): Promise<PersistedTaskState[]> {
	if (!raw) {
		return [];
	}

	try {
		const parsed = JSON.parse(raw) as PersistedTaskState[];
		if (Array.isArray(parsed)) {
			const tasks = parsed.map((task, index) => ({
				id: typeof task?.id === 'string' && task.id.trim() ? task.id : `cached-${index}`,
				name: task?.name,
				data: task?.data,
				status: task?.status ?? 'done',
				renderOrder: task?.renderOrder
			}));

			if (opts?.hydrateRawContent) {
				for (const task of tasks) {
					if (task.id === 'content' && isRawContentRef(task.data)) {
						const text = await invoke<string | null>('read_raw_content', {
							key: task.data[RAW_CONTENT_REF]
						});
						task.data = typeof text === 'string' ? text : '';
					}
				}
			}

			return tasks;
		}
	} catch (error) {
		console.warn('Unable to parse stored tasks JSON', error);
	}

	return [];
}

export function shouldPersistTask<TMap extends TaskMapBase>(task: Task<TMap>): boolean {
	return task.persist === true;
}

export function toStoredTask<TMap extends TaskMapBase>(task: Task<TMap>): PersistedTaskState {
	return {
		id: task.id,
		name: task.name,
		data: task.data,
		status: task.status,
		renderOrder: task.renderOrder
	};
}

export function mergeStoredTasks<TMap extends TaskMapBase>(
	existingTasks: PersistedTaskState[] | undefined,
	nextTasks: Task<TMap>[]
): PersistedTaskState[] {
	const mergedTasks = new Map<string, PersistedTaskState>();

	for (const task of existingTasks ?? []) {
		mergedTasks.set(task.id, {
			id: task.id,
			name: task.name,
			data: task.data,
			status: task.status,
			renderOrder: task.renderOrder
		});
	}

	for (const task of nextTasks) {
		if (!shouldPersistTask(task)) {
			continue;
		}

		mergedTasks.set(task.id, toStoredTask(task));
	}

	return Array.from(mergedTasks.values());
}

export function getStoredTaskData<T>(
	tasks: Array<{ id?: string; data?: unknown }>,
	taskId: string
): T | undefined {
	return tasks.find((task) => task.id === taskId)?.data as T | undefined;
}

async function wrapRawContentRef(url: string, task: PersistedTaskState): Promise<void> {
	if (task.id !== 'content' || typeof task.data !== 'string' || task.data.length === 0) {
		return;
	}

	const key = await invoke<string>('write_raw_content', { url, text: task.data });
	task.data = { [RAW_CONTENT_REF]: key };
}

export function getArticleStringField(article: ArticleWithTasks | null, fieldName: string): string {
	const fieldValue = article?.[fieldName];
	return typeof fieldValue === 'string' ? fieldValue : '';
}

export function normalizeNullableString(value: string | null | undefined): string | null {
	if (typeof value !== 'string') {
		return null;
	}

	const normalized = value.trim();
	return normalized.length > 0 ? normalized : null;
}

export function firstNormalizedString(...values: Array<string | null | undefined>): string | null {
	for (const value of values) {
		const normalized = normalizeNullableString(value);
		if (normalized) {
			return normalized;
		}
	}

	return null;
}

export function parseKeywords(data: unknown): string[] {
	if (typeof data === 'string') {
		try {
			return parseKeywords(JSON.parse(data) as unknown);
		} catch {
			return [];
		}
	}

	if (Array.isArray(data)) {
		return data.map((keyword) => String(keyword).trim()).filter(Boolean);
	}

	if (typeof data === 'object' && data !== null) {
		const record = data as Record<string, unknown>;

		if (Array.isArray(record.keywords)) {
			return record.keywords.map((keyword) => String(keyword).trim()).filter(Boolean);
		}

		if (Array.isArray(record.finalResponse)) {
			return record.finalResponse.map((keyword) => String(keyword).trim()).filter(Boolean);
		}

		return Object.values(record)
			.filter((value): value is string => typeof value === 'string')
			.map((value) => value.trim())
			.filter(Boolean);
	}

	return [];
}

export function getFirstStringValue(value: unknown): string | null {
	if (typeof value === 'string') {
		return value;
	}

	if (Array.isArray(value)) {
		for (const item of value) {
			if (typeof item === 'string') {
				return item;
			}
		}
	}

	return null;
}

export function getPageElementField(
	tasks: Array<{ id?: string; data?: unknown }>,
	taskId: string,
	fieldName: string
): string | null {
	const data = getStoredTaskData<unknown>(tasks, taskId);

	if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
		const value = (data as Record<string, unknown>)[fieldName];
		return getFirstStringValue(value);
	}

	if (Array.isArray(data)) {
		const item = data.find((entry) => {
			if (typeof entry !== 'object' || entry === null) {
				return false;
			}

			const candidate = entry as LegacyPageElementItem;
			return candidate.name === fieldName;
		});

		if (typeof item === 'object' && item !== null) {
			return getFirstStringValue((item as LegacyPageElementItem).textContent);
		}
	}

	return null;
}

export function buildEmbeddingSourceText(input: {
	title: string | null;
	keywords: string[];
}): string | null {
	const parts = [
		normalizeNullableString(input.title),
		input.keywords.length > 0 ? `Keywords:\n${input.keywords.join('\n')}` : null
	].filter((value): value is string => Boolean(value));

	return parts.length > 0 ? parts.join('\n\n') : null;
}

export type ArticleFieldOverrides = {
	title?: string;
	thumbnail?: string;
	directory?: string;
	mainColor?: string;
	profile?: string;
	date?: string;
	templateId?: string;
};

export async function buildUpsertInput(params: {
	url: string;
	tasksToSave: Array<{ id?: string; data?: unknown }>;
	existingArticle: ArticleWithTasks | null;
	valuesToOverride?: ArticleFieldOverrides | undefined;
}): Promise<UpsertWebStoreArticleInput> {
	const title = firstNormalizedString(
		params.valuesToOverride?.title,
		getStoredTaskData<string>(params.tasksToSave, 'title'),
		params.existingArticle?.title
	);

	const thumbnailTaskData =
		getStoredTaskData<{
			thumbnailImage?: string;
			mediaDirectory?: string;
		}>(params.tasksToSave, 'thumbnail') ?? {};

	const thumbnail = firstNormalizedString(
		params.valuesToOverride?.thumbnail,
		thumbnailTaskData.thumbnailImage,
		params.existingArticle?.thumbnail
	);
	const directory = firstNormalizedString(
		params.valuesToOverride?.directory,
		thumbnailTaskData.mediaDirectory,
		getArticleStringField(params.existingArticle, 'mediaDirectory'),
		getArticleStringField(params.existingArticle, 'directory')
	);
	const mainColor = firstNormalizedString(
		params.valuesToOverride?.mainColor,
		getStoredTaskData<string>(params.tasksToSave, 'main-color'),
		params.existingArticle?.mainColor ?? null,
		params.existingArticle?.primaryColor ?? null
	);
	const keywords = parseKeywords(getStoredTaskData<unknown>(params.tasksToSave, 'analysis'));
	const profile = firstNormalizedString(
		params.valuesToOverride?.profile,
		getArticleStringField(params.existingArticle, 'profile')
	);

	const videoInfoData = getStoredTaskData<{ uploadDate?: string }>(
		params.tasksToSave,
		'video-info'
	);
	const date = firstNormalizedString(
		params.valuesToOverride?.date,
		videoInfoData?.uploadDate,
		params.existingArticle?.date as string | undefined
	);

	const requestedTemplateId = normalizeNullableString(params.valuesToOverride?.templateId);
	const existingTemplateId = normalizeNullableString(
		getArticleStringField(params.existingArticle, 'templateId')
	);
	const templateId = isRealTemplateId(requestedTemplateId)
		? requestedTemplateId
		: isRealTemplateId(existingTemplateId)
			? existingTemplateId
			: (requestedTemplateId ?? existingTemplateId);

	const embeddingSourceText = buildEmbeddingSourceText({
		title,
		keywords
	});

	return {
		url: params.url,
		title,
		thumbnail,
		directory,
		mainColor,
		profile,
		embeddingSourceText,
		date,
		templateId
	};
}

export async function mapStoredArticle(
	row: WebStoreArticleRecord,
	tasksJson?: string | null,
	opts?: { hydrateRawContent?: boolean }
): Promise<ArticleWithTasks> {
	return {
		...row,
		profilePicture: row.profilePicture,
		profileId: row.profile,
		persistedTasks: await parsePersistedTaskStates(tasksJson ?? null, opts)
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

async function resolveArticleThumbnail(article: ArticleWithTasks): Promise<ArticleWithTasks> {
	return resolveMediaSrc(article, 'thumbnail', 'thumbnailSrc', false);
}

async function resolveArticleThumbnailBatch(
	articles: ArticleWithTasks[]
): Promise<ArticleWithTasks[]> {
	return resolveMediaSrcBatch(articles, 'thumbnail', 'thumbnailSrc', false);
}

async function resolveArticleProfilePictureBatch(
	articles: ArticleWithTasks[]
): Promise<ArticleWithTasks[]> {
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
async function mapAndResolveArticles(rows: WebStoreArticleRecord[]): Promise<ArticleWithTasks[]> {
	const mappedArticles = await Promise.all(rows.map((row) => mapStoredArticle(row)));

	return resolveArticleProfilePictureBatch(await resolveArticleThumbnailBatch(mappedArticles));
}

export async function mapArticlesFromRecords(
	rows: WebStoreArticleRecord[]
): Promise<ArticleWithTasks[]> {
	if (rows.length === 0) {
		return [];
	}

	return mapAndResolveArticles(rows);
}

export async function getArticles(): Promise<ArticleWithTasks[]> {
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
				let articles: ArticleWithTasks[] | undefined;
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

export async function getTasksByUrl(url: string): Promise<PersistedTaskState[] | null> {
	try {
		const taskRecord = await invoke<WebStoreTaskRecord | null>('get_web_store_tasks_by_url', {
			url
		});

		if (!taskRecord) {
			return null;
		}

		// Detail path: hydrate the `content` ref into real text (one IPC per URL).
		return parsePersistedTaskStates(taskRecord.tasksJson, { hydrateRawContent: true });
	} catch (error) {
		console.error('Error querying tasks', error);
		return null;
	}
}

export async function getTaskChunks(url: string, taskId: string): Promise<RecursiveChunk[] | null> {
	try {
		const chunks = await invoke<unknown>('get_web_store_task_chunks', { url, taskId });
		if (!Array.isArray(chunks)) {
			return null;
		}
		return chunks as RecursiveChunk[];
	} catch (error) {
		console.error('Error fetching task chunks', error);
		return null;
	}
}

export async function getArticleWithTasksByUrl(url: string): Promise<ArticleWithTasks | null> {
	try {
		const [row, taskRecord] = await Promise.all([
			invoke<WebStoreArticleRecord | null>('get_web_store_article_by_url', { url }),
			invoke<WebStoreTaskRecord | null>('get_web_store_tasks_by_url', { url })
		]);

		if (!row) {
			return null;
		}

		// Detail path: hydrate the `content` ref into real text (one IPC per URL).
		const article = await mapStoredArticle(row, taskRecord?.tasksJson ?? null, {
			hydrateRawContent: true
		});
		return resolveArticleThumbnail(article);
	} catch (error) {
		console.error('Error querying article', error);
		return null;
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

export async function saveArticle(
	url: string,
	tasksToSave: Array<{ id?: string; data?: unknown }>,
	valuesToOverride?: ArticleFieldOverrides | undefined,
	existingArticle?: ArticleWithTasks | null
): Promise<void> {
	let input: Awaited<ReturnType<typeof buildUpsertInput>> | undefined;
	try {
		const resolvedExisting =
			existingArticle !== undefined ? existingArticle : await getArticleWithTasksByUrl(url);
		input = await buildUpsertInput({
			url,
			tasksToSave,
			existingArticle: resolvedExisting,
			valuesToOverride
		});

		await invoke('upsert_web_store_article', { input });
	} catch (error) {
		console.error(
			`Error upserting article (url='${url}', domain from url, profile='${input?.profile ?? 'none'}'):`,
			error
		);
		return;
	}

	try {
		const categoryNames = getStoredTaskData<string[]>(tasksToSave, 'category');
		if (categoryNames && Array.isArray(categoryNames) && categoryNames.length > 0) {
			const categoryIds = categoryNames
				.map((name) => name.trim().toLowerCase().replace(/\s+/g, '-'))
				.filter(Boolean);
			if (categoryIds.length > 0) {
				await assignCategoriesToArticle({ articleUrl: url, categoryIds });
			}
		}
	} catch (error) {
		console.error(`Error assigning categories to article (url='${url}'):`, error);
	}
}

export async function saveTasks<TMap extends TaskMapBase>(
	url: string,
	tasks: Task<TMap>[],
	existingArticle?: ArticleWithTasks | null
): Promise<void> {
	try {
		const resolvedExisting =
			existingArticle !== undefined ? existingArticle : await getArticleWithTasksByUrl(url);
		const tasksToSave = mergeStoredTasks(resolvedExisting?.persistedTasks, tasks);

		for (const task of tasksToSave) {
			await wrapRawContentRef(url, task);
		}

		await invoke('upsert_web_store_tasks', {
			url,
			tasksJson: JSON.stringify(tasksToSave)
		});
	} catch (error) {
		console.error('Error saving tasks:', error);
	}
}

export async function updateTaskDataById(
	url: string,
	taskId: string,
	data: unknown
): Promise<void> {
	try {
		// Atomic server-side read-modify-write (IPC-7): only the new data
		// travels; the content ref wrap happens in Rust.
		await invoke('update_web_store_task_data', { url, taskId, data });
	} catch (error) {
		console.error('Error updating task data:', error);
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
	templateId?: string;
	includeInitial?: boolean;
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
			templateId: options?.templateId ?? null,
			includeInitial: options?.includeInitial ?? null
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
	articles: ArticleWithTasks[];
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
