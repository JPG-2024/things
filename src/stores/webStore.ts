import { invoke } from '@tauri-apps/api/core';
import { deleteMediaFile, getMediaSrc } from '@/lib/utils/files';
import type { Task, TaskMapBase } from '@/types/taskRunner.types';

export type PersistedTaskState = {
	id: string;
	data?: unknown;
	status?: Task['status'];
	component?: string;
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
	profilePicture?: string | null;
	primaryColor?: string | null;
	mainColor?: string | null;
	date?: string | null;
	persistedTasks?: PersistedTaskState[];
	viewed?: boolean | null;
	[key: string]: unknown;
}

export interface ProfileWithArticles {
	profileId: string;
	profileName: string;
	profilePicture?: string | null;
	profilePictureSrc?: string | null;
	profileUrl?: string | null;
	articles: ArticleWithTasks[];
}

export interface ArticlesWithoutProfileResponse {
	articles: ArticleWithTasks[];
	total: number;
}
export const WEB_STORE_UNKNOWN_PROFILE_ID = '__unknown_profile__';
export const WEB_STORE_UNKNOWN_PROFILE_LABEL = 'Unknown profile';
//div[contains(concat(" ", normalize-space(@class), " "), " hp-hero-title_wrapper ")]/div[contains(concat(" ", normalize-space(@class), " "), " t-body-large ")]
export interface ArticleProfile {
	id: string;
	name: string;
	count?: number;
	profilePicture?: string | null;
	profilePictureSrc?: string | null;
	url?: string | null;
}

type SearchRowKind = 'content_chunk' | 'keyword_bundle';

export type WebStoreArticleRecord = {
	id: string;
	url: string | null;
	createdAt: number;
	title: string | null;
	thumbnail: string | null;
	content: string | null;
	directory: string | null;
	mediaDirectory: string | null;
	profile: string | null;
	mainColor: string | null;
	primaryColor: string | null;
	updatedAt: number;
	embeddingSourceText: string | null;
	profilePicture: string | null;
	viewed: boolean;
	date: string | null;
};

export type WebStoreTaskRecord = {
	url: string;
	tasksJson: string;
	updatedAt: number;
};

type SearchRowInput = {
	rowId: string;
	kind: SearchRowKind;
	ordinal: number;
	text: string;
};

export type WebStoreProfileRecord = {
	id: string;
	name: string;
	count: number;
	profilePicture?: string | null;
	url?: string | null;
};

export type WebStoreProfileDeletion = {
	success: boolean;
	deletedCount: number;
};

export type WebStoreProfileSummary = {
	id: string;
	name: string;
	mostRecentCreatedAt: number;
	profilePicture?: string;
	profilePictureSrc?: string;
	lastVideoDate?: string;
};

export type WebStoreCategoryRecord = {
	id: string;
	name: string;
	lastModified: number;
	deletedAt: number | null;
};

export type UpsertWebStoreCategoryInput = {
	id: string;
	name: string;
};

export type ProfileCategoryInput = {
	profileId: string;
	categoryId: string;
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
};

type StoredTask = {
	id?: string;
	data?: unknown;
	status?: Task['status'];
	component?: string;
};

type LegacyPageElementItem = {
	name?: unknown;
	textContent?: unknown;
};

let _cachedTasksByUrl: Map<string, string> | null = null;
let _cachedTasksTimestamp = 0;
let _pendingTasksPromise: Promise<Map<string, string>> | null = null;
const TASKS_CACHE_TTL = 30_000;

async function getTasksByUrlMap(): Promise<Map<string, string>> {
	if (_cachedTasksByUrl && Date.now() - _cachedTasksTimestamp < TASKS_CACHE_TTL) {
		return _cachedTasksByUrl;
	}

	if (!_pendingTasksPromise) {
		_pendingTasksPromise = (async () => {
			const tasks = await invoke<WebStoreTaskRecord[]>('list_web_store_tasks');
			const map = new Map<string, string>();
			for (const task of tasks) {
				map.set(task.url, task.tasksJson);
			}
			_cachedTasksByUrl = map;
			_cachedTasksTimestamp = Date.now();
			_pendingTasksPromise = null;
			return map;
		})();
	}

	return _pendingTasksPromise;
}

export function parsePersistedTaskStates(raw: string | null): PersistedTaskState[] {
	if (!raw) {
		return [];
	}

	try {
		const parsed = JSON.parse(raw) as StoredTask[];
		if (Array.isArray(parsed)) {
			return parsed.map((task, index) => ({
				id: typeof task?.id === 'string' && task.id.trim() ? task.id : `cached-${index}`,
				data: task?.data,
				status: task?.status ?? 'done',
				component: task?.component
			}));
		}
	} catch (error) {
		console.warn('Unable to parse stored tasks JSON', error);
	}

	return [];
}

export function shouldPersistTask<TMap extends TaskMapBase>(task: Task<TMap>): boolean {
	const hasComponent = typeof task.component === 'string' && task.component.trim().length > 0;
	return hasComponent || task.persist === true;
}

export function toStoredTask<TMap extends TaskMapBase>(task: Task<TMap>): StoredTask {
	return {
		id: task.id,
		data: task.data,
		status: task.status,
		component: task.component
	};
}

export function mergeStoredTasks<TMap extends TaskMapBase>(
	existingTasks: PersistedTaskState[] | undefined,
	nextTasks: Task<TMap>[]
): StoredTask[] {
	const mergedTasks = new Map<string, StoredTask>();

	for (const task of existingTasks ?? []) {
		mergedTasks.set(task.id, {
			id: task.id,
			data: task.data,
			status: task.status,
			component: task.component
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

export function getArticleStringField(article: ArticleWithTasks | null, fieldName: any): string {
	const fieldValue = article?.[fieldName];
	return typeof fieldValue === 'string' ? fieldValue : '';
}

export async function deleteArticleMedia(article: ArticleWithTasks | null): Promise<void> {
	const thumbnail = article?.thumbnail;
	if (typeof thumbnail === 'string' && thumbnail.trim()) {
		await deleteMediaFile(thumbnail);
	}
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

export async function buildUpsertInput(params: {
	url: string;
	tasksToSave: Array<{ id?: string; data?: unknown }>;
	existingArticle: ArticleWithTasks | null;
	valuesToOverride?: Partial<Record<string, unknown>> | undefined;
}): Promise<UpsertWebStoreArticleInput> {
	const title = firstNormalizedString(
		params.valuesToOverride?.title as string | undefined,
		getStoredTaskData<string>(params.tasksToSave, 'title'),
		params.existingArticle?.title
	);

	const thumbnailTaskData =
		getStoredTaskData<{
			thumbnailImage?: string;
			mediaDirectory?: string;
		}>(params.tasksToSave, 'thumbnail') ?? {};

	const thumbnail = firstNormalizedString(
		params.valuesToOverride?.thumbnail as string | undefined,
		thumbnailTaskData.thumbnailImage,
		params.existingArticle?.thumbnail
	);
	const directory = firstNormalizedString(
		params.valuesToOverride?.directory as string | undefined,
		thumbnailTaskData.mediaDirectory,
		getArticleStringField(params.existingArticle, 'mediaDirectory'),
		getArticleStringField(params.existingArticle, 'directory')
	);
	const mainColor = firstNormalizedString(
		params.valuesToOverride?.mainColor as string | undefined,
		getStoredTaskData<string>(params.tasksToSave, 'main-color'),
		params.existingArticle?.mainColor ?? null,
		params.existingArticle?.primaryColor ?? null
	);
	const keywords = parseKeywords(getStoredTaskData<unknown>(params.tasksToSave, 'keywords'));
	const profile = firstNormalizedString(
		params.valuesToOverride?.profile as string | undefined,
		getArticleStringField(params.existingArticle, 'profile')
	);

	const videoInfoData = getStoredTaskData<{ uploadDate?: string }>(
		params.tasksToSave,
		'video-info'
	);
	const date = firstNormalizedString(
		params.valuesToOverride?.date as string | undefined,
		videoInfoData?.uploadDate,
		params.existingArticle?.date as string | undefined
	);

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
		date
	};
}

export function mapStoredArticle(
	row: WebStoreArticleRecord,
	tasksJson?: string | null
): ArticleWithTasks {
	const resolvedTasksJson = tasksJson ?? '[]';

	return {
		...row,
		profilePicture: row.profilePicture,
		persistedTasks: parsePersistedTaskStates(resolvedTasksJson)
	};
}

async function resolveArticleThumbnail(article: ArticleWithTasks): Promise<ArticleWithTasks> {
	const thumbnail = article.thumbnail;

	if (!thumbnail || thumbnail.includes('://')) {
		return article;
	}

	const thumbnailSrc = await getMediaSrc(thumbnail);
	return { ...article, thumbnailSrc };
}

async function resolveArticleThumbnailBatch(
	articles: ArticleWithTasks[]
): Promise<ArticleWithTasks[]> {
	return Promise.all(articles.map(resolveArticleThumbnail));
}

async function resolveProfilePictureField<T extends { profilePicture?: string | null }>(
	profile: T
): Promise<T & { profilePictureSrc?: string | null }> {
	const profilePicture = profile.profilePicture;

	if (!profilePicture || profilePicture.includes('://')) {
		return { ...profile, profilePictureSrc: profilePicture ?? null };
	}

	const profilePictureSrc = await getMediaSrc(profilePicture);
	return { ...profile, profilePictureSrc };
}

async function resolveProfilePictureBatch<T extends { profilePicture?: string | null }>(
	profiles: T[]
): Promise<(T & { profilePictureSrc?: string | null })[]> {
	return Promise.all(profiles.map(resolveProfilePictureField));
}

export async function fetchWebStoreArticlesByProfile(
	profileId: string,
	fields?: string[],
	dateFrom?: string,
	limit?: number
): Promise<WebStoreArticleRecord[]> {
	const payload: {
		profileId: string;
		fields?: string[];
		dateFrom?: string;
		limit?: number;
	} = { profileId };

	if (fields) {
		payload.fields = fields;
	}

	if (typeof dateFrom === 'string') {
		payload.dateFrom = dateFrom;
	}

	if (typeof limit === 'number') {
		payload.limit = limit;
	}

	return invoke<WebStoreArticleRecord[]>('list_web_store_articles_by_profile', payload);
}

export async function getArticles(): Promise<ArticleWithTasks[]> {
	try {
		const [articles, tasksByUrl] = await Promise.all([
			invoke<WebStoreArticleRecord[]>('list_web_store_articles'),
			getTasksByUrlMap()
		]);

		const mappedArticles = articles.map((row) =>
			mapStoredArticle(row, tasksByUrl.get(row.url ?? '') ?? null)
		);

		return resolveArticleThumbnailBatch(mappedArticles);
	} catch (error) {
		console.error('Error querying DB articles', error);
		return [];
	}
}

export async function getProfiles(): Promise<ArticleProfile[]> {
	try {
		const result = await invoke<ArticleProfile[]>('list_web_store_profiles');

		return resolveProfilePictureBatch(result);
	} catch (error) {
		console.error('Error querying article profiles', error);
		return [];
	}
}

export async function getProfile(profileId: string): Promise<ArticleProfile | null> {
	try {
		const result = await invoke<ArticleProfile | null>('get_web_store_profile', {
			profileId
		});

		if (!result) {
			return null;
		}

		return resolveProfilePictureField(result);
	} catch (error) {
		console.error('Error querying profile', error);
		return null;
	}
}

export async function getProfilesWithArticlesAfter(
	createdAtFrom: number
): Promise<WebStoreProfileSummary[]> {
	try {
		const result = await invoke<WebStoreProfileSummary[]>(
			'list_web_store_profiles_with_articles_after',
			{ createdAtFrom }
		);

		return resolveProfilePictureBatch(result);
	} catch (error) {
		console.error('Error querying profiles with articles after date', error);
		return [];
	}
}

export async function getArticlesByProfile(
	profileId: string,
	options?: {
		dateFrom?: string;
		limit?: number;
	}
): Promise<ArticleWithTasks[]> {
	try {
		console.log('OPTIONS', options);
		const [articles, tasksByUrl] = await Promise.all([
			fetchWebStoreArticlesByProfile(
				profileId,
				['id', 'url', 'title', 'thumbnail', 'mediaDirectory', 'viewed'],
				options?.dateFrom,
				options?.limit
			),
			getTasksByUrlMap()
		]);

		const mappedArticles = articles.map((row) =>
			mapStoredArticle(row, tasksByUrl.get(row.url ?? '') ?? null)
		);

		return resolveArticleThumbnailBatch(mappedArticles);
	} catch (error) {
		console.error('Error querying profile articles', error);
		return [];
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

		return parsePersistedTaskStates(taskRecord.tasksJson);
	} catch (error) {
		console.error('Error querying tasks', error);
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

		const article = mapStoredArticle(row, taskRecord?.tasksJson ?? null);
		return resolveArticleThumbnail(article);
	} catch (error) {
		console.error('Error querying article', error);
		return null;
	}
}

export async function saveArticle(
	url: string,
	tasksToSave: Array<{ id?: string; data?: unknown }>,
	valuesToOverride?: Partial<Record<string, unknown>> | undefined
): Promise<void> {
	try {
		const existingArticle = await getArticleWithTasksByUrl(url);
		const input = await buildUpsertInput({
			url,
			tasksToSave,
			existingArticle,
			valuesToOverride
		});

		await invoke('upsert_web_store_article', { input });
	} catch (error) {
		console.error('Error saving article:', error);
	}
}

export async function saveTasks<TMap extends TaskMapBase>(
	url: string,
	tasks: Task<TMap>[]
): Promise<void> {
	try {
		const existingArticle = await getArticleWithTasksByUrl(url);
		const tasksToSave = mergeStoredTasks(existingArticle?.persistedTasks, tasks);

		await invoke('upsert_web_store_tasks', {
			url,
			tasksJson: JSON.stringify(tasksToSave)
		});
	} catch (error) {
		console.error('Error saving tasks:', error);
	}
}

export async function deleteArticleByUrl(url: string): Promise<{ success: boolean }> {
	try {
		const existingArticle = await getArticleWithTasksByUrl(url);
		await deleteArticleMedia(existingArticle);

		await Promise.all([
			invoke('delete_web_store_article_by_url', { url }),
			invoke('delete_web_store_tasks_by_url', { url })
		]);

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
		const profile = await getProfile(profileId);

		if (profile?.profilePicture && profile.profilePicture.trim()) {
			await deleteMediaFile(profile.profilePicture);
		}

		const articles = await fetchWebStoreArticlesByProfile(profileId);
		for (const article of articles) {
			await deleteArticleMedia(mapStoredArticle(article));
		}

		return await invoke<WebStoreProfileDeletion>('delete_web_store_profile', {
			profileId
		});
	} catch (error) {
		console.error('Error deleting article profile:', error);
		return { success: false, deletedCount: 0 };
	}
}

export async function saveProfile(
	profileId: string,
	profilePicture: string | null,
	lastVideoDate: string | null,
	url: string | null = null
): Promise<unknown> {
	try {
		const res = await invoke('upsert_web_store_profile', {
			input: {
				id: profileId.toLowerCase().replace(/\s+/g, '-'),
				name: profileId.toLowerCase().replace(/\s+/g, '-'),
				profilePicture,
				lastVideoDate,
				url
			}
		});

		return res;
	} catch (error) {
		console.error('Error saving profile:', error);
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

export async function assignCategoriesToProfile(
	input: AssignCategoriesToProfileInput
): Promise<void> {
	try {
		await invoke('assign_categories_to_profile', { input });
	} catch (error) {
		console.error('Error assigning categories to profile:', error);
	}
}

export async function unassignCategoryFromProfile(input: ProfileCategoryInput): Promise<boolean> {
	try {
		return await invoke<boolean>('unassign_category_from_profile', { input });
	} catch (error) {
		console.error('Error unassigning category from profile:', error);
		return false;
	}
}

export async function getCategoriesByProfile(profileId: string): Promise<WebStoreCategoryRecord[]> {
	try {
		return await invoke<WebStoreCategoryRecord[]>('list_categories_by_profile', { profileId });
	} catch (error) {
		console.error('Error fetching categories by profile:', error);
		return [];
	}
}

export async function getProfilesByCategories(categoryIds: string[]): Promise<ArticleProfile[]> {
	try {
		if (categoryIds.length === 0) {
			return await getProfiles();
		}
		const result = await invoke<ArticleProfile[]>('list_profiles_by_categories', {
			categoryIds
		});
		return resolveProfilePictureBatch(result);
	} catch (error) {
		console.error('Error fetching profiles by categories:', error);
		return [];
	}
}

export async function getArticlesWithProfiles(
	articleCount: number,
	options?: { categoryIds?: string[]; offset?: number; limit?: number }
): Promise<ProfileWithArticles[]> {
	try {
		const result = await invoke<
			Array<{
				profileId: string;
				profileName: string;
				profilePicture: string | null;
				profileUrl: string | null;
				articles: WebStoreArticleRecord[];
			}>
		>('list_articles_with_profiles', {
			articleCount,
			categoryIds: options?.categoryIds ?? null,
			offset: options?.offset ?? null,
			limit: options?.limit ?? null
		});

		const resolvedProfiles = await resolveProfilePictureBatch(result);

		const profilesWithArticles: ProfileWithArticles[] = [];
		for (const profile of resolvedProfiles) {
			const [tasksByUrl] = await Promise.all([getTasksByUrlMap()]);
			const mappedArticles = profile.articles.map((row) =>
				mapStoredArticle(row, tasksByUrl.get(row.url ?? '') ?? null)
			);
			const resolvedArticles = await resolveArticleThumbnailBatch(mappedArticles);

			profilesWithArticles.push({
				profileId: profile.profileId,
				profileName: profile.profileName,
				profilePicture: profile.profilePicture,
				profilePictureSrc: profile.profilePictureSrc ?? null,
				profileUrl: profile.profileUrl,
				articles: resolvedArticles
			});
		}

		return profilesWithArticles;
	} catch (error) {
		console.error('Error fetching articles with profiles:', error);
		return [];
	}
}

export async function getArticlesWithoutProfile(options?: {
	offset?: number;
	limit?: number;
}): Promise<ArticlesWithoutProfileResponse> {
	try {
		const result = await invoke<{
			articles: WebStoreArticleRecord[];
			total: number;
		}>('list_articles_without_profile', {
			offset: options?.offset ?? null,
			limit: options?.limit ?? null
		});

		const [tasksByUrl] = await Promise.all([getTasksByUrlMap()]);
		const mappedArticles = result.articles.map((row) =>
			mapStoredArticle(row, tasksByUrl.get(row.url ?? '') ?? null)
		);
		const resolvedArticles = await resolveArticleThumbnailBatch(mappedArticles);

		return { articles: resolvedArticles, total: result.total };
	} catch (error) {
		console.error('Error fetching articles without profile:', error);
		return { articles: [], total: 0 };
	}
}
