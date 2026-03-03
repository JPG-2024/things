import Database from "@tauri-apps/plugin-sql";
import { BaseDirectory, remove } from "@tauri-apps/plugin-fs";
import type { Task } from "@/types/taskRunner.types";
import { getImageSrc } from "@/lib/utils/files";

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

export interface ArticleWithPlayerTask {
	id: number;
	url: string | null;
	title: string | null;
	thumbnail: string | null;
	tasks: Task[];
	[key: string]: unknown;
}

type ArticleRow = {
	id: number;
	url: string | null;
	title: string | null;
	thumbnail: string | null;
	tasks: string | null;
	[key: string]: unknown;
};

export async function getArticleByUrl(url: string): Promise<Article | null> {
	const db = await getDb();

	try {
		const result = await db.select<Array<any>>(
			// expose the implicit rowid as id for later deletion
			`SELECT rowid as id, * FROM articles WHERE url = $1 LIMIT 1`,
			[url],
		);

		if (result && result.length > 0) {
			const article = result[0];
			return {
				...article,
				metadataContent: article.metadataContent ? JSON.parse(article.metadataContent) : {},
				mainImageSrc: article.mainImage
					? await getImageSrc(article.mediaDirectory, article.mainImage)
					: "",
			};
		}

		return null;
	} catch (error) {
		console.error("Error querying article from database:", error);
		throw error;
	}
}

function parseStoredTasks(raw: string | null): Task[] {
	if (!raw) {
		return [];
	}

	try {
		const parsed = JSON.parse(raw) as StoredTask[];
		if (Array.isArray(parsed)) {
			return parsed.map((task, index) => {
				const id = typeof task?.id === "string" && task.id.trim() ? task.id : `cached-${index}`;
				return {
					id,
					name: id,
					dependencies: [],
					type: "script",
					run: () => task?.data,
					data: task?.data,
					status: task?.status ?? "done",
					component: task?.component,
				} satisfies Task;
			});
		}
	} catch (error) {
		console.warn("Unable to parse stored tasks JSON", error);
	}

	return [];
}

export async function getArticles(): Promise<ArticleWithPlayerTask[]> {
	const database = await getDb();

	try {
		const result = await database.select<ArticleRow[]>(
			`SELECT rowid as id, * FROM articles ORDER BY rowid DESC`,
			[],
		);
		return result.map((row) => {
			const metadataContent =
				typeof row.metadataContent === "string" && row.metadataContent
					? JSON.parse(row.metadataContent)
					: row.metadataContent;

			return {
				...row,
				metadataContent,
				tasks: parseStoredTasks(row.tasks),
			} as ArticleWithPlayerTask;
		});
	} catch (error) {
		console.error("Error querying articles with player task", error);
		return [];
	}
}

export async function getArticleCacheMap(): Promise<Map<string, ArticleWithPlayerTask>> {
	const articles = await getArticles();
	const articleMap = new Map<string, ArticleWithPlayerTask>();

	for (const article of articles) {
		if (!article.url) continue;
		articleMap.set(article.url, article);
	}

	return articleMap;
}

export async function saveTasks(url: string, tasks: Task[]): Promise<void> {
	const database = await getDb();

	const tasksToSave: StoredTask[] = tasks
		.filter((task) => task.component)
		.map((task) => ({
			id: task.id,
			data: task.data,
			status: task.status,
			component: task.component,
		}));

	const tasksJson = JSON.stringify(tasksToSave);

	// extract content, thumbnail, title, and mediaDirectory from tasks
	const content = tasks.find((task) => task.id === "content")?.data || "";
	const thumbnailTaskData =
		(tasks.find((task) => task.id === "thumbnail")?.data as
			| { thumbnailImageSrc?: string; mediaDirectory?: string }
			| undefined) || {};
	const thumbnail = thumbnailTaskData.thumbnailImageSrc || "";
	const mediaDirectory = thumbnailTaskData.mediaDirectory || "";
	const title = tasks.find((task) => task.id === "title")?.data || "";

	await database.execute(
		`INSERT INTO articles (url, tasks, content, thumbnail, title, directory)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 ON CONFLICT(url) DO UPDATE SET tasks = excluded.tasks, content = excluded.content, thumbnail = excluded.thumbnail, title = excluded.title, directory = excluded.directory`,
		[url, tasksJson, content, thumbnail, title, mediaDirectory],
	);
}

export async function deleteArticleByUrl(url: string): Promise<{ success: boolean }> {
	const database = await getDb();

	try {
		const result = await database.select<Array<{ directory: string | null }>>(
			`SELECT directory FROM articles WHERE url = $1 LIMIT 1`,
			[url],
		);

		const directory = result?.[0]?.directory;
		if (typeof directory === "string" && directory.trim()) {
			const mediaPath = `media/${directory}`;
			try {
				await remove(mediaPath, { baseDir: BaseDirectory.AppData, recursive: true });
				console.log(`[Media] Deleted media directory: ${mediaPath}`);
			} catch (error) {
				console.error(`[Media] Error deleting media directory: ${error}`);
			}
		}

		await database.execute(`DELETE FROM articles WHERE url = $1`, [url]);

		try {
			const { removeArticleFromCache: removeFromUrlRouterCache } = await import("@/lib/urlRouter");
			removeFromUrlRouterCache(url);
		} catch (error) {
			console.warn("Unable to clear urlRouter cache after delete", error);
		}

		return { success: true };
	} catch (error) {
		console.error("Error deleting article from database:", error);
		return { success: false };
	}
}
