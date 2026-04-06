import Database from "@tauri-apps/plugin-sql";
import { BaseDirectory, remove } from "@tauri-apps/plugin-fs";
import type { Task, TaskMapBase } from "@/types/taskRunner.types";

let db: Database | null = null;

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
	mainColor?: string | null;
	tasks: Task[];
	persistedTasks?: PersistedTaskState[];
	[key: string]: unknown;
}

type ArticleRow = {
	id: number;
	url: string | null;
	title: string | null;
	thumbnail: string | null;
	tasks: string | null;
	main_color?: string | null;
	metadataContent?: unknown;
	[key: string]: unknown;
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
	tasks: StoredTask[],
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

export async function getArticles(): Promise<ArticleWithTasks[]> {
	const database = await getDb();

	try {
		const result = await database.select<ArticleRow[]>(
			`SELECT rowid as id, * FROM articles ORDER BY rowid DESC`,
			[]
		);

		return result.map((row) => {
			const metadataContent =
				typeof row.metadataContent === "string" && row.metadataContent
					? JSON.parse(row.metadataContent)
					: row.metadataContent;
			const mainColor =
				typeof row.main_color === "string" ? row.main_color : null;

			return {
				...row,
				metadataContent,
				mainColor,
				tasks: parseStoredTasks(row.tasks),
			} as ArticleWithTasks;
		});
	} catch (error) {
		console.error("Error querying articles with player task", error);
		return [];
	}
}

export async function getArticleWithTasksByUrl(
	url: string
): Promise<ArticleWithTasks | null> {
	const database = await getDb();

	try {
		const result = await database.select<ArticleRow[]>(
			`SELECT rowid as id, * FROM articles WHERE url = $1 LIMIT 1`,
			[url]
		);

		const row = result?.[0];
		if (!row) {
			return null;
		}

		const persistedTasks = parsePersistedTaskStates(row.tasks);
		const metadataContent =
			typeof row.metadataContent === "string" && row.metadataContent
				? JSON.parse(row.metadataContent)
				: row.metadataContent;

		const mainColor =
			typeof row.main_color === "string" ? row.main_color : "#000000";

		return {
			...row,
			metadataContent,
			mainColor,
			tasks: parseStoredTasks(row.tasks),
			persistedTasks,
		} as ArticleWithTasks;
	} catch (error) {
		console.error("Error querying article with player task", error);
		return null;
	}
}

export async function saveTasks<TMap extends TaskMapBase>(
	url: string,
	tasks: Task<TMap>[]
): Promise<void> {
	const database = await getDb();
	const existingArticle = await getArticleWithTasksByUrl(url);
	const tasksToSave = mergeStoredTasks(existingArticle?.persistedTasks, tasks);
	const tasksJson = JSON.stringify(tasksToSave);

	const content =
		getStoredTaskData<string>(tasksToSave, "content") ??
		getArticleStringField(existingArticle, "content");
	const thumbnailTaskData =
		getStoredTaskData<{
			thumbnailImageSrc?: string;
			mediaDirectory?: string;
		}>(tasksToSave, "thumbnail") ?? {};
	const thumbnail =
		thumbnailTaskData.thumbnailImageSrc ?? existingArticle?.thumbnail ?? "";
	const mediaDirectory =
		thumbnailTaskData.mediaDirectory ??
		getArticleStringField(existingArticle, "directory");
	const title =
		getStoredTaskData<string>(tasksToSave, "title") ??
		existingArticle?.title ??
		"";
	const mainColor =
		getStoredTaskData<string>(tasksToSave, "main-color") ??
		existingArticle?.mainColor ??
		"";

	await database.execute(
		`INSERT INTO articles (url, tasks, content, thumbnail, title, directory, main_color)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 ON CONFLICT(url) DO UPDATE SET tasks = excluded.tasks, content = excluded.content, thumbnail = excluded.thumbnail, title = excluded.title, directory = excluded.directory, main_color = excluded.main_color`,
		[url, tasksJson, content, thumbnail, title, mediaDirectory, mainColor]
	);
}

export async function deleteArticleByUrl(
	url: string
): Promise<{ success: boolean }> {
	const database = await getDb();

	try {
		const result = await database.select<Array<{ directory: string | null }>>(
			`SELECT directory FROM articles WHERE url = $1 LIMIT 1`,
			[url]
		);

		const directory = result?.[0]?.directory;
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

		await database.execute(`DELETE FROM articles WHERE url = $1`, [url]);

		return { success: true };
	} catch (error) {
		console.error("Error deleting article from database:", error);
		return { success: false };
	}
}
