import { invoke } from '@tauri-apps/api/core';
import { BaseDirectory, remove } from '@tauri-apps/plugin-fs';
import { splitText } from '@/lib/utils/splitter';
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
	content?: string | null;
	mediaDirectory?: string | null;
	profileId?: string | null;
	profilePicture?: string | null;
	primaryColor?: string | null;
	mainColor?: string | null;
	persistedTasks?: PersistedTaskState[];
	[key: string]: unknown;
}

export const UNKNOWN_PROFILE_ID = '__unknown_profile__';
export const UNKNOWN_PROFILE_LABEL = 'Unknown profile';

export interface ArticleProfile {
	id: string;
	name: string;
	count?: number;
	profilePicture?: string | null;
}

type SearchRowKind = 'content_chunk' | 'keyword_bundle';

export type StoredArticleRecord = {
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
	tasksJson: string | null;
	updatedAt: number;
	embeddingSourceText: string | null;
	profilePicture: string | null;
};

type StoredArticleSearchRowInput = {
	rowId: string;
	kind: SearchRowKind;
	ordinal: number;
	text: string;
};

export type StoredArticleProfileRecord = {
	id: string;
	name: string;
	count: number;
	profilePicture?: string | null;
};

export type DeleteStoredArticleProfileResult = {
	success: boolean;
	deletedCount: number;
};

export type ProfileWithMostRecentArticle = {
	id: string;
	name: string;
	mostRecentCreatedAt: number;
	profilePicture?: string;
	lastVideoDate?: string;
};

type UpsertStoredArticleInput = {
	url: string;
	title: string | null;
	thumbnail: string | null;
	directory: string | null;
	mainColor: string | null;
	profile: string | null;
	profilePicture: string | null;
	tasksJson: string;
	embeddingSourceText: string | null;
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

export function getArticleMediaDirectory(article: ArticleWithTasks | null): string | null {
	return firstNormalizedString(
		getArticleStringField(article, 'mediaDirectory'),
		getArticleStringField(article, 'directory')
	);
}

export function normalizeOwnedMediaFileName(value: unknown): string | null {
	if (typeof value !== 'string') {
		return null;
	}

	const normalized = value.trim();
	if (!normalized || normalized.includes('/') || normalized.includes('\\')) {
		return null;
	}

	return normalized;
}

export function collectOwnedMediaFiles(tasks: PersistedTaskState[] | undefined): string[] {
	const ownedFiles = new Set<string>();

	for (const task of tasks ?? []) {
		if (typeof task.data !== 'object' || task.data === null || Array.isArray(task.data)) {
			continue;
		}

		const data = task.data as Record<string, unknown>;
		for (const fileValue of [data.thumbnailImage, data.fileName]) {
			const fileName = normalizeOwnedMediaFileName(fileValue);
			if (fileName) {
				ownedFiles.add(fileName);
			}
		}

		if (Array.isArray(data.mediaFiles)) {
			for (const fileValue of data.mediaFiles) {
				const fileName = normalizeOwnedMediaFileName(fileValue);
				if (fileName) {
					ownedFiles.add(fileName);
				}
			}
		}
	}

	return Array.from(ownedFiles);
}

export function isLegacyArticleMediaDirectory(directory: string): boolean {
	return /^[a-f0-9]{16}$/i.test(directory.trim());
}

export async function deleteArticleMedia(article: ArticleWithTasks | null): Promise<void> {
	const directory = getArticleMediaDirectory(article);
	if (!directory) {
		return;
	}

	const ownedFiles = collectOwnedMediaFiles(article?.persistedTasks);
	if (ownedFiles.length === 0) {
		if (!isLegacyArticleMediaDirectory(directory)) {
			return;
		}

		const mediaPath = `media/${directory}`;
		try {
			await remove(mediaPath, {
				baseDir: BaseDirectory.AppData,
				recursive: true
			});
			console.log(`[Media] Deleted legacy media directory: ${mediaPath}`);
		} catch (error) {
			console.error(`[Media] Error deleting legacy media directory: ${error}`);
		}
		return;
	}

	for (const fileName of ownedFiles) {
		const mediaPath = `media/${directory}/${fileName}`;
		try {
			await remove(mediaPath, {
				baseDir: BaseDirectory.AppData
			});
			console.log(`[Media] Deleted media file: ${mediaPath}`);
		} catch (error) {
			console.error(`[Media] Error deleting media file: ${error}`);
		}
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
	if (Array.isArray(data)) {
		return data.map((keyword) => String(keyword).trim()).filter(Boolean);
	}

	if (typeof data === 'object' && data !== null && 'keywords' in data) {
		const value = data.keywords;
		return Array.isArray(value)
			? value.map((keyword) => String(keyword).trim()).filter(Boolean)
			: [];
	}

	if (typeof data === 'string') {
		try {
			const parsed = JSON.parse(data) as { keywords?: unknown };
			return parseKeywords(parsed);
		} catch {
			return [];
		}
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
}): Promise<UpsertStoredArticleInput> {
	const title = firstNormalizedString(
		params.valuesToOverride?.title as string | undefined,
		getStoredTaskData<string>(params.tasksToSave, 'title'),
		params.existingArticle?.title
	);

	/* 	const content = firstNormalizedString(
		params.valuesToOverride?.content as string | undefined,
		getStoredTaskData<string>(params.tasksToSave, 'content'),
		getArticleStringField(params.existingArticle, 'content')
	); */

	const thumbnailTaskData =
		getStoredTaskData<{
			thumbnailImageSrc?: string;
			mediaDirectory?: string;
		}>(params.tasksToSave, 'thumbnail') ?? {};

	const thumbnail = firstNormalizedString(
		params.valuesToOverride?.thumbnail as string | undefined,
		thumbnailTaskData.thumbnailImageSrc,
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
		getPageElementField(params.tasksToSave, 'video-info', 'profileId'),
		getArticleStringField(params.existingArticle, 'profileId')
	);
	const profilePicture = firstNormalizedString(
		params.valuesToOverride?.profilePicture as string | undefined,
		getPageElementField(params.tasksToSave, 'video-info', 'profilePicture')
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
		profilePicture,
		tasksJson: JSON.stringify(params.tasksToSave),
		embeddingSourceText
	};
}

export function mapStoredArticle(row: StoredArticleRecord): ArticleWithTasks {
	const tasksJson = row.tasksJson ?? '[]';
	//const mainColor = typeof row.mainColor === 'string' ? row.mainColor : row.primaryColor;

	return {
		...row,
		profilePicture: row.profilePicture,
		persistedTasks: parsePersistedTaskStates(tasksJson)
	};
}

export async function fetchStoredArticlesByProfile(
	profileId: string,
	fields?: string[],
	createdAtFrom?: number,
	limit?: number
): Promise<StoredArticleRecord[]> {
	const payload: {
		profileId: string;
		fields?: string[];
		createdAtFrom?: number;
		limit?: number;
	} = { profileId };

	if (fields) {
		payload.fields = fields;
	}

	if (typeof createdAtFrom === 'number') {
		payload.createdAtFrom = createdAtFrom;
	}

	if (typeof limit === 'number') {
		payload.limit = limit;
	}

	return invoke<StoredArticleRecord[]>('list_stored_articles_by_profile', payload);
}
