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
	primaryColor?: string | null;
	mainColor?: string | null;
	tasks: Task[];
	persistedTasks?: PersistedTaskState[];
	[key: string]: unknown;
}

export const UNKNOWN_PROFILE_ID = "__unknown_profile__";
export const UNKNOWN_PROFILE_LABEL = "Unknown profile";

export interface ArticleProfile {
	id: string;
	name: string;
	count: number;
}

type SearchRowKind = "content_chunk" | "keyword_bundle";

type StoredArticleRecord = {
	id: number;
	url: string | null;
	articleUid: string;
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
};

type UpsertStoredArticleInput = {
	url: string;
	title: string | null;
	thumbnail: string | null;
	content: string | null;
	directory: string | null;
	mainColor: string | null;
	profile: string | null;
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

function parseStoredTasks(raw: string | null): Task[] {
	return parsePersistedTaskStates(raw)
		.filter(
			(task) => typeof task.component === "string" || task.status === "done"
		)
		.map(
			(task) =>
				({
					id: task.id,
					name: task.id,
					dependencies: [],
					type: "script",
					run: () => task.data,
					data: task.data,
					status: task.status ?? "done",
					component: task.component,
				}) satisfies Task
		);
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

function normalizeNullableString(
	value: string | null | undefined
): string | null {
	if (typeof value !== "string") {
		return null;
	}

	const normalized = value.trim();
	return normalized.length > 0 ? normalized : null;
}

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
	fieldName: string
): string | null {
	const data = getStoredTaskData<unknown>(tasks, "video-info");

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
	tasksJson: string;
	title?: string | null;
	thumbnail?: string | null;
	content?: string | null;
	directory?: string | null;
	mainColor?: string | null;
	profile?: string | null;
}): Promise<UpsertStoredArticleInput> {
	const title = firstNormalizedString(
		params.title,
		getStoredTaskData<string>(params.tasksToSave, "title"),
		params.existingArticle?.title ?? null
	);
	const content = firstNormalizedString(
		params.content,
		getStoredTaskData<string>(params.tasksToSave, "content"),
		getArticleStringField(params.existingArticle, "content")
	);
	const thumbnailTaskData =
		getStoredTaskData<{
			thumbnailImageSrc?: string;
			mediaDirectory?: string;
		}>(params.tasksToSave, "thumbnail") ?? {};
	const thumbnail = firstNormalizedString(
		params.thumbnail,
		thumbnailTaskData.thumbnailImageSrc,
		params.existingArticle?.thumbnail ?? null
	);
	const directory = firstNormalizedString(
		params.directory,
		thumbnailTaskData.mediaDirectory,
		getArticleStringField(params.existingArticle, "mediaDirectory"),
		getArticleStringField(params.existingArticle, "directory")
	);
	const mainColor = firstNormalizedString(
		params.mainColor,
		getStoredTaskData<string>(params.tasksToSave, "main-color"),
		params.existingArticle?.mainColor ?? null,
		params.existingArticle?.primaryColor ?? null
	);
	const keywords = parseKeywords(
		getStoredTaskData<unknown>(params.tasksToSave, "keywords")
	);
	const profile = firstNormalizedString(
		params.profile,
		getPageElementField(params.tasksToSave, "profile"),
		getArticleStringField(params.existingArticle, "profile")
	);
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
		tasksJson: params.tasksJson,
		embeddingSourceText,
		searchRows,
	};
}
function mapStoredArticle(row: StoredArticleRecord): ArticleWithTasks {
	const tasksJson = row.tasksJson ?? "[]";
	const mainColor =
		typeof row.mainColor === "string" ? row.mainColor : row.primaryColor;

	return {
		id: row.id,
		url: row.url,
		title: row.title,
		thumbnail: row.thumbnail,
		content: row.content,
		mediaDirectory: row.mediaDirectory,
		profile: row.profile,
		directory: row.directory,
		mainColor,
		primaryColor: mainColor,
		articleUid: row.articleUid,
		updatedAt: row.updatedAt,
		embeddingSourceText: row.embeddingSourceText,
		tasks: parseStoredTasks(tasksJson),
		persistedTasks: parsePersistedTaskStates(tasksJson),
	};
}

export async function getArticles(): Promise<ArticleWithTasks[]> {
	try {
		const result = await invoke<StoredArticleRecord[]>("list_stored_articles");

		console.log("Queried articles from database:", result);
		return result
			.map((row) => mapStoredArticle(row))
			.sort(
				(left, right) =>
					Number(right.updatedAt ?? 0) - Number(left.updatedAt ?? 0)
			);
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

		return result
			.map((row) => ({
				id:
					typeof row.id === "string" && row.id.trim()
						? row.id.trim()
						: UNKNOWN_PROFILE_ID,
				name:
					typeof row.name === "string" && row.name.trim()
						? row.name.trim()
						: UNKNOWN_PROFILE_LABEL,
				count: Number(row.count ?? 0),
			}))
			.filter((row) => row.count > 0)
			.sort(
				(left, right) =>
					right.count - left.count || left.name.localeCompare(right.name)
			);
	} catch (error) {
		console.error("Error querying article profiles", error);
		return [];
	}
}

export async function getArticlesByProfile(
	profileId: string
): Promise<ArticleWithTasks[]> {
	try {
		const result = await invoke<StoredArticleRecord[]>(
			"list_stored_articles_by_profile",
			{ profileId }
		);

		return result
			.map((row) => mapStoredArticle(row))
			.sort(
				(left, right) =>
					Number(right.updatedAt ?? 0) - Number(left.updatedAt ?? 0)
			);
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
	tasks: Task<TMap>[]
): Promise<void> {
	const existingArticle = await getArticleWithTasksByUrl(url);
	const tasksToSave = mergeStoredTasks(existingArticle?.persistedTasks, tasks);
	const tasksJson = JSON.stringify(tasksToSave);
	const input = await buildUpsertInput({
		url,
		tasksToSave,
		existingArticle,
		tasksJson,
	});

	console.log("Saving article with input:", input);

	await invoke("upsert_stored_article", { input });
}

export async function deleteArticleByUrl(
	url: string
): Promise<{ success: boolean }> {
	try {
		const existingArticle = await getArticleWithTasksByUrl(url);
		const directory =
			typeof existingArticle?.mediaDirectory === "string"
				? existingArticle.mediaDirectory
				: typeof existingArticle?.directory === "string"
					? existingArticle.directory
					: null;
		if (typeof directory === "string" && directory.trim()) {
			const mediaPath = `media/${directory}`;
			try {
				await remove(mediaPath, {
					baseDir: BaseDirectory.AppData,
					recursive: true,
				});
				console.log(`[Media] Deleted media directory: ${mediaPath}`);
			} catch (error) {
				console.error(`[Media] Error deleting media directory: ${error}`);
			}
		}

		await invoke("delete_stored_article_by_url", { url });

		return { success: true };
	} catch (error) {
		console.error("Error deleting article from database:", error);
		return { success: false };
	}
}
