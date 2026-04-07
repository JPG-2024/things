import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";
import { BaseDirectory, remove } from "@tauri-apps/plugin-fs";
import { splitText } from "@/lib/utils/splitter";
import type { Task, TaskMapBase } from "@/types/taskRunner.types";

let db: Database | null = null;
let legacyMigrationPromise: Promise<void> | null = null;

const LEGACY_MIGRATION_KEY = "notian:lancedb-articles-migration-v1";

async function getDb() {
	if (!db) {
		db = await Database.load("sqlite:notian.db");
	}
	return db;
}

type StoredTask = {
	id?: string;
	data?: unknown;
	status?: Task["status"];
	component?: string;
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
	primaryColor?: string | null;
	mainColor?: string | null;
	tasks: Task[];
	persistedTasks?: PersistedTaskState[];
	[key: string]: unknown;
}

type LegacyArticleRow = {
	id: number;
	url: string | null;
	title: string | null;
	thumbnail: string | null;
	tasks: string | null;
	main_color?: string | null;
	metadataContent?: unknown;
	[key: string]: unknown;
};

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

type UpsertStoredArticleInput = {
	url: string;
	title: string | null;
	thumbnail: string | null;
	content: string | null;
	directory: string | null;
	mainColor: string | null;
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
	fieldName: string
): string {
	const fieldValue = article?.[fieldName];
	return typeof fieldValue === "string" ? fieldValue : "";
}

function getLegacyMigrationStatus(): boolean {
	if (typeof window === "undefined") {
		return false;
	}

	try {
		return window.localStorage.getItem(LEGACY_MIGRATION_KEY) === "done";
	} catch {
		return false;
	}
}

function setLegacyMigrationStatus(): void {
	if (typeof window === "undefined") {
		return;
	}

	try {
		window.localStorage.setItem(LEGACY_MIGRATION_KEY, "done");
	} catch {
		// Ignore storage failures and keep runtime-only migration protection.
	}
}

function normalizeNullableString(value: string | null | undefined): string | null {
	if (typeof value !== "string") {
		return null;
	}

	const normalized = value.trim();
	return normalized.length > 0 ? normalized : null;
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
}): Promise<UpsertStoredArticleInput> {
	const title =
		normalizeNullableString(params.title) ??
		normalizeNullableString(getStoredTaskData<string>(params.tasksToSave, "title")) ??
		normalizeNullableString(params.existingArticle?.title ?? null);
	const content =
		normalizeNullableString(params.content) ??
		normalizeNullableString(
			getStoredTaskData<string>(params.tasksToSave, "content")
		) ??
		normalizeNullableString(getArticleStringField(params.existingArticle, "content"));
	const thumbnailTaskData =
		getStoredTaskData<{
			thumbnailImageSrc?: string;
			mediaDirectory?: string;
		}>(params.tasksToSave, "thumbnail") ?? {};
	const thumbnail =
		normalizeNullableString(params.thumbnail) ??
		normalizeNullableString(thumbnailTaskData.thumbnailImageSrc) ??
		normalizeNullableString(params.existingArticle?.thumbnail ?? null);
	const directory =
		normalizeNullableString(params.directory) ??
		normalizeNullableString(thumbnailTaskData.mediaDirectory) ??
		normalizeNullableString(
			getArticleStringField(params.existingArticle, "mediaDirectory") ||
				getArticleStringField(params.existingArticle, "directory")
		);
	const mainColor =
		normalizeNullableString(params.mainColor) ??
		normalizeNullableString(
			getStoredTaskData<string>(params.tasksToSave, "main-color")
		) ??
		normalizeNullableString(params.existingArticle?.mainColor ?? null) ??
		normalizeNullableString(params.existingArticle?.primaryColor ?? null);
	const keywords = parseKeywords(
		getStoredTaskData<unknown>(params.tasksToSave, "keywords")
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
		tasksJson: params.tasksJson,
		embeddingSourceText,
		searchRows,
	};
}

async function ensureLegacyMigration(): Promise<void> {
	if (getLegacyMigrationStatus()) {
		return;
	}

	if (!legacyMigrationPromise) {
		legacyMigrationPromise = migrateLegacyArticles();
	}

	await legacyMigrationPromise;
}

async function migrateLegacyArticles(): Promise<void> {
	const database = await getDb();
	let legacyRows: LegacyArticleRow[] = [];

	try {
		legacyRows = await database.select<LegacyArticleRow[]>(
			`SELECT rowid as id, * FROM articles ORDER BY rowid ASC`,
			[]
		);
	} catch (error) {
		console.warn("Unable to read legacy SQLite articles for migration", error);
		setLegacyMigrationStatus();
		return;
	}

	for (const row of legacyRows) {
		if (typeof row.url !== "string" || !row.url.trim()) {
			continue;
		}

		const persistedTasks = parsePersistedTaskStates(row.tasks);
		const input = await buildUpsertInput({
			url: row.url,
			tasksToSave: persistedTasks,
			existingArticle: null,
			tasksJson: row.tasks ?? "[]",
			title: typeof row.title === "string" ? row.title : null,
			thumbnail: typeof row.thumbnail === "string" ? row.thumbnail : null,
			content: typeof row.content === "string" ? row.content : null,
			directory: typeof row.directory === "string" ? row.directory : null,
			mainColor: typeof row.main_color === "string" ? row.main_color : null,
		});

		try {
			await invoke("upsert_stored_article", { input });
		} catch (error) {
			console.error("Unable to migrate legacy article into LanceDB", {
				url: row.url,
				error,
			});
		}
	}

	setLegacyMigrationStatus();
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
	await ensureLegacyMigration();

	try {
		const result = await invoke<StoredArticleRecord[]>("list_stored_articles");

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

export async function getArticleWithTasksByUrl(
	url: string
): Promise<ArticleWithTasks | null> {
	await ensureLegacyMigration();

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
	await ensureLegacyMigration();
	const existingArticle = await getArticleWithTasksByUrl(url);
	const tasksToSave = mergeStoredTasks(existingArticle?.persistedTasks, tasks);
	const tasksJson = JSON.stringify(tasksToSave);
	const input = await buildUpsertInput({
		url,
		tasksToSave,
		existingArticle,
		tasksJson,
	});

	await invoke("upsert_stored_article", { input });
}

export async function deleteArticleByUrl(
	url: string
): Promise<{ success: boolean }> {
	await ensureLegacyMigration();

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

		const database = await getDb();
		await database.execute(`DELETE FROM articles WHERE url = $1`, [url]);

		return { success: true };
	} catch (error) {
		console.error("Error deleting article from database:", error);
		return { success: false };
	}
}
