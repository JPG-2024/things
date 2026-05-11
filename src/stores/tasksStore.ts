import { invoke } from "@tauri-apps/api/core";
import { BaseDirectory, remove } from "@tauri-apps/plugin-fs";
import { splitText } from "@/lib/utils/splitter";
import type { Task, TaskMapBase } from "@/types/taskRunner.types";

type StoredTask = {
	id?: string;
	data?: unknown;
	status?: Task["status"];
	component?: string;
};

type LegacyPageElementItem = {
	name?: unknown;
	textContent?: unknown;
};

export type PersistedTaskState = {
	id: string;
	data?: unknown;
	status?: Task["status"];
	component?: string;
};

export interface ArticleWithTasks {
	id: number;
	url: string | null;
	title: string | null;
	thumbnail: string | null;
	content?: string | null;
	mediaDirectory?: string | null;
	profile?: string | null;
	profilePicture?: string | null;
	primaryColor?: string | null;
	mainColor?: string | null;
	persistedTasks?: PersistedTaskState[];
	[key: string]: unknown;
}

export const UNKNOWN_PROFILE_ID = "__unknown_profile__";
export const UNKNOWN_PROFILE_LABEL = "Unknown profile";

export interface ArticleProfile {
	id: string;
	name: string;
	count: number;
	picture?: string | null;
}

type SearchRowKind = "content_chunk" | "keyword_bundle";

type StoredArticleRecord = {
	id: number;
	url: string | null;
	articleUid: string;
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

type StoredArticleProfileRecord = {
	id: string;
	name: string;
	count: number;
	profilePicture?: string | null;
};

type DeleteStoredArticleProfileResult = {
	success: boolean;
	deletedCount: number;
};

type ProfileWithMostRecentArticle = {
	id: string;
	name: string;
	mostRecentCreatedAt: number;
	profilePicture?: string;
};

type UpsertStoredArticleInput = {
	url: string;
	title: string | null;
	thumbnail: string | null;
	content: string | null;
	directory: string | null;
	mainColor: string | null;
	profile: string | null;
	profilePicture: string | null;
	tasksJson: string;
	embeddingSourceText: string | null;
	searchRows: StoredArticleSearchRowInput[];
};

function parsePersistedTaskStates(raw: string | null): PersistedTaskState[] {
	if (!raw) {
		return [];
	}

	try {
		const parsed = JSON.parse(raw) as StoredTask[];
		if (Array.isArray(parsed)) {
			return parsed.map((task, index) => ({
				id:
					typeof task?.id === "string" && task.id.trim()
						? task.id
						: `cached-${index}`,
				data: task?.data,
				status: task?.status ?? "done",
				component: task?.component,
			}));
		}
	} catch (error) {
		console.warn("Unable to parse stored tasks JSON", error);
	}

	return [];
}

function shouldPersistTask<TMap extends TaskMapBase>(
	task: Task<TMap>
): boolean {
	const hasComponent =
		typeof task.component === "string" && task.component.trim().length > 0;
	return hasComponent || task.persist === true;
}

function toStoredTask<TMap extends TaskMapBase>(task: Task<TMap>): StoredTask {
	return {
		id: task.id,
		data: task.data,
		status: task.status,
		component: task.component,
	};
}

function mergeStoredTasks<TMap extends TaskMapBase>(
	existingTasks: PersistedTaskState[] | undefined,
	nextTasks: Task<TMap>[]
): StoredTask[] {
	const mergedTasks = new Map<string, StoredTask>();

	for (const task of existingTasks ?? []) {
		mergedTasks.set(task.id, {
			id: task.id,
			data: task.data,
			status: task.status,
			component: task.component,
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

function getStoredTaskData<T>(
	tasks: Array<{ id?: string; data?: unknown }>,
	taskId: string
): T | undefined {
	return tasks.find((task) => task.id === taskId)?.data as T | undefined;
}

function getArticleStringField(
	article: ArticleWithTasks | null,
	fieldName: "content" | "profile" | "mediaDirectory" | "directory"
): string {
	const fieldValue = article?.[fieldName];
	return typeof fieldValue === "string" ? fieldValue : "";
}

function getArticleMediaDirectory(
	article: ArticleWithTasks | null
): string | null {
	return firstNormalizedString(
		getArticleStringField(article, "mediaDirectory"),
		getArticleStringField(article, "directory")
	);
}

function normalizeOwnedMediaFileName(value: unknown): string | null {
	if (typeof value !== "string") {
		return null;
	}

	const normalized = value.trim();
	if (!normalized || normalized.includes("/") || normalized.includes("\\")) {
		return null;
	}

	return normalized;
}

function collectOwnedMediaFiles(
	tasks: PersistedTaskState[] | undefined
): string[] {
	const ownedFiles = new Set<string>();

	for (const task of tasks ?? []) {
		if (
			typeof task.data !== "object" ||
			task.data === null ||
			Array.isArray(task.data)
		) {
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

function isLegacyArticleMediaDirectory(directory: string): boolean {
	return /^[a-f0-9]{16}$/i.test(directory.trim());
}

async function deleteArticleMedia(
	article: ArticleWithTasks | null
): Promise<void> {
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
				recursive: true,
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
				baseDir: BaseDirectory.AppData,
			});
			console.log(`[Media] Deleted media file: ${mediaPath}`);
		} catch (error) {
			console.error(`[Media] Error deleting media file: ${error}`);
		}
	}
}

function normalizeNullableString(
	value: string | null | undefined
): string | null {
	if (typeof value !== "string") {
		return null;
	}

	const normalized = value.trim();
	return normalized.length > 0 ? normalized : null;
}

/**
 * Returns the first non-empty, trimmed string from the provided values.
 * Each value is normalized (trimmed and checked for non-empty).
 * Returns null if all values are null, undefined, or empty after normalization.
 *
 * @param values - List of string, null, or undefined values to check.
 * @returns The first normalized string, or null if none found.
 */
function firstNormalizedString(
	...values: Array<string | null | undefined>
): string | null {
	for (const value of values) {
		const normalized = normalizeNullableString(value);
		if (normalized) {
			return normalized;
		}
	}

	return null;
}

function parseKeywords(data: unknown): string[] {
	if (Array.isArray(data)) {
		return data.map((keyword) => String(keyword).trim()).filter(Boolean);
	}

	if (typeof data === "object" && data !== null && "keywords" in data) {
		const value = data.keywords;
		return Array.isArray(value)
			? value.map((keyword) => String(keyword).trim()).filter(Boolean)
			: [];
	}

	if (typeof data === "string") {
		try {
			const parsed = JSON.parse(data) as { keywords?: unknown };
			return parseKeywords(parsed);
		} catch {
			return [];
		}
	}

	return [];
}

function getFirstStringValue(value: unknown): string | null {
	if (typeof value === "string") {
		return value;
	}

	if (Array.isArray(value)) {
		for (const item of value) {
			if (typeof item === "string") {
				return item;
			}
		}
	}

	return null;
}

function getPageElementField(
	tasks: Array<{ id?: string; data?: unknown }>,
	taskId: string,
	fieldName: string
): string | null {
	const data = getStoredTaskData<unknown>(tasks, taskId);

	if (typeof data === "object" && data !== null && !Array.isArray(data)) {
		const value = (data as Record<string, unknown>)[fieldName];
		return getFirstStringValue(value);
	}

	if (Array.isArray(data)) {
		const item = data.find((entry) => {
			if (typeof entry !== "object" || entry === null) {
				return false;
			}

			const candidate = entry as LegacyPageElementItem;
			return candidate.name === fieldName;
		});

		if (typeof item === "object" && item !== null) {
			return getFirstStringValue((item as LegacyPageElementItem).textContent);
		}
	}

	return null;
}

async function buildSearchRows(
	content: string | null,
	keywords: string[]
): Promise<StoredArticleSearchRowInput[]> {
	const searchRows: StoredArticleSearchRowInput[] = [];
	const normalizedContent = normalizeNullableString(content);

	if (normalizedContent) {
		const mode = /(^|\n)#{1,6}\s|```/.test(normalizedContent)
			? "markdown"
			: "podcast";
		let chunks: string[] = [];

		try {
			chunks = await splitText({
				mode,
				text: normalizedContent,
				capacityChars: 1200,
				overlapChars: 120,
			});
		} catch (error) {
			console.warn("Unable to split content for LanceDB indexing", error);
			chunks = [normalizedContent];
		}

		for (const [index, chunk] of chunks.entries()) {
			const text = normalizeNullableString(chunk);
			if (!text) {
				continue;
			}

			searchRows.push({
				rowId: `content_chunk:${index}`,
				kind: "content_chunk",
				ordinal: index,
				text,
			});
		}
	}

	const keywordText = normalizeNullableString(keywords.join("\n"));
	if (keywordText) {
		searchRows.push({
			rowId: "keyword_bundle:0",
			kind: "keyword_bundle",
			ordinal: 0,
			text: keywordText,
		});
	}

	return searchRows;
}

function buildEmbeddingSourceText(input: {
	title: string | null;
	content: string | null;
	keywords: string[];
}): string | null {
	const parts = [
		normalizeNullableString(input.title),
		input.keywords.length > 0
			? `Keywords:\n${input.keywords.join("\n")}`
			: null,
		normalizeNullableString(input.content),
	].filter((value): value is string => Boolean(value));

	return parts.length > 0 ? parts.join("\n\n") : null;
}

async function buildUpsertInput(params: {
	url: string;
	tasksToSave: Array<{ id?: string; data?: unknown }>;
	existingArticle: ArticleWithTasks | null;
	valuesToOverride?: Partial<Record<string, unknown>> | undefined;
}): Promise<UpsertStoredArticleInput> {
	const title = firstNormalizedString(
		params.valuesToOverride?.title as string | undefined,
		getStoredTaskData<string>(params.tasksToSave, "title"),
		params.existingArticle?.title
	);
	const content = firstNormalizedString(
		params.valuesToOverride?.content as string | undefined,
		getStoredTaskData<string>(params.tasksToSave, "content"),
		getArticleStringField(params.existingArticle, "content")
	);
	const thumbnailTaskData =
		getStoredTaskData<{
			thumbnailImageSrc?: string;
			mediaDirectory?: string;
		}>(params.tasksToSave, "thumbnail") ?? {};

	const thumbnail = firstNormalizedString(
		params.valuesToOverride?.thumbnail as string | undefined,
		thumbnailTaskData.thumbnailImageSrc,
		params.existingArticle?.thumbnail
	);
	const directory = firstNormalizedString(
		params.valuesToOverride?.directory as string | undefined,
		thumbnailTaskData.mediaDirectory,
		getArticleStringField(params.existingArticle, "mediaDirectory"),
		getArticleStringField(params.existingArticle, "directory")
	);
	const mainColor = firstNormalizedString(
		params.valuesToOverride?.mainColor as string | undefined,
		getStoredTaskData<string>(params.tasksToSave, "main-color"),
		params.existingArticle?.mainColor ?? null,
		params.existingArticle?.primaryColor ?? null
	);
	const keywords = parseKeywords(
		getStoredTaskData<unknown>(params.tasksToSave, "keywords")
	);
	const profile = firstNormalizedString(
		params.valuesToOverride?.profile as string | undefined,
		getPageElementField(params.tasksToSave, "video-info", "profile"),
		getArticleStringField(params.existingArticle, "profile")
	);
	const profilePicture = firstNormalizedString(
		params.valuesToOverride?.profilePicture as string | undefined,
		getPageElementField(params.tasksToSave, "video-info", "profilePicture")
	);

	print 

	const searchRows = await buildSearchRows(content, keywords);
	const embeddingSourceText = buildEmbeddingSourceText({
		title,
		content,
		keywords,
	});

	return {
		url: params.url,
		title,
		thumbnail,
		content,
		directory,
		mainColor,
		profile,
		profilePicture,
		tasksJson: JSON.stringify(params.tasksToSave),
		embeddingSourceText,
		searchRows,
	};
}

function mapStoredArticle(row: StoredArticleRecord): ArticleWithTasks {
	const tasksJson = row.tasksJson ?? "[]";
	const mainColor =
		typeof row.mainColor === "string" ? row.mainColor : row.primaryColor;

	return {
		...row,
		mainColor,
		profilePicture: row.profilePicture,
		persistedTasks: parsePersistedTaskStates(tasksJson),
	};
}

async function fetchStoredArticlesByProfile(
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

	if (typeof createdAtFrom === "number") {
		payload.createdAtFrom = createdAtFrom;
	}

	if (typeof limit === "number") {
		payload.limit = limit;
	}

	return invoke<StoredArticleRecord[]>(
		"list_stored_articles_by_profile",
		payload
	);
}

export async function getArticles(): Promise<ArticleWithTasks[]> {
	try {
		const result = await invoke<StoredArticleRecord[]>("list_stored_articles");

		return result.map((row) => mapStoredArticle(row));
	} catch (error) {
		console.error("Error querying LanceDB articles", error);
		return [];
	}
}

export async function getProfiles(): Promise<ArticleProfile[]> {
	try {
		const result = await invoke<StoredArticleProfileRecord[]>(
			"list_stored_article_profiles"
		);

		return result;
	} catch (error) {
		console.error("Error querying article profiles", error);
		return [];
	}
}

export async function getProfilesWithArticlesAfter(
	createdAtFrom: number
): Promise<ProfileWithMostRecentArticle[]> {
	try {
		const result = await invoke<ProfileWithMostRecentArticle[]>(
			"list_profiles_with_articles_after",
			{ createdAtFrom }
		);

		return result;
	} catch (error) {
		console.error("Error querying profiles with articles after date", error);
		return [];
	}
}

export async function getArticlesByProfile(
	profileId: string,
	options?: {
		createdAtFrom?: number;
		limit?: number;
	}
): Promise<ArticleWithTasks[]> {
	try {
		const result = await fetchStoredArticlesByProfile(
			profileId,
			["id", "url", "title", "thumbnail"],
			options?.createdAtFrom,
			options?.limit
		);

		return result.map((row) => mapStoredArticle(row));
	} catch (error) {
		console.error("Error querying profile articles", error);
		return [];
	}
}

export async function getArticleWithTasksByUrl(
	url: string
): Promise<ArticleWithTasks | null> {
	try {
		const row = await invoke<StoredArticleRecord | null>(
			"get_stored_article_by_url",
			{ url }
		);

		if (!row) {
			return null;
		}

		return mapStoredArticle(row);
	} catch (error) {
		console.error("Error querying LanceDB article", error);
		return null;
	}
}

export async function saveTasks<TMap extends TaskMapBase>(
	url: string,
	tasks: Task<TMap>[],
	valuesToOverride?: Partial<Record<string, unknown>> | undefined
): Promise<void> {
	const existingArticle = await getArticleWithTasksByUrl(url);
	const tasksToSave = mergeStoredTasks(existingArticle?.persistedTasks, tasks);
	const input = await buildUpsertInput({
		url,
		tasksToSave,
		existingArticle,
		valuesToOverride,
	});

	console.log(">>>> Tasl tp save", tasksToSave)

	await invoke("upsert_stored_article", { input });
}

export async function deleteArticleByUrl(
	url: string
): Promise<{ success: boolean }> {
	try {
		const existingArticle = await getArticleWithTasksByUrl(url);
		await deleteArticleMedia(existingArticle);

		await invoke("delete_stored_article_by_url", { url });

		return { success: true };
	} catch (error) {
		console.error("Error deleting article from database:", error);
		return { success: false };
	}
}

export async function deleteProfileById(
	profileId: string
): Promise<DeleteStoredArticleProfileResult> {
	try {
		const articles = await fetchStoredArticlesByProfile(profileId);
		for (const article of articles) {
			await deleteArticleMedia(mapStoredArticle(article));
		}

		return await invoke<DeleteStoredArticleProfileResult>(
			"delete_stored_article_profile",
			{ profileId }
		);
	} catch (error) {
		console.error("Error deleting article profile:", error);
		return { success: false, deletedCount: 0 };
	}
}
