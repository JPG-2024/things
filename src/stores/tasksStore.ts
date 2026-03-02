import Database from "@tauri-apps/plugin-sql";
import type { Task } from "@/types/taskRunner.types";

let db: Database | null = null;

async function getDb() {
	if (!db) {
		db = await Database.load("sqlite:notian.db");
	}
	return db;
}

export interface ArticleWithPlayerTask {
	id: number;
	url: string | null;
	playerTask: Task;
}

type ArticleRow = {
	id: number;
	url: string | null;
	tasks: string | null;
};

function parseStoredTasks(raw: string | null): Task[] {
	if (!raw) {
		return [];
	}

	try {
		const parsed = JSON.parse(raw);
		if (Array.isArray(parsed)) {
			return parsed as Task[];
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
			`SELECT rowid as id, url, tasks FROM articles ORDER BY rowid DESC`,
			[],
		);

		return result
			.map((row) => {
				const playerTask = parseStoredTasks(row.tasks).find(
					(task) => task.id === "player" || task.component === "player",
				);

				if (!playerTask) {
					return null;
				}

				return {
					id: row.id,
					url: row.url,
					playerTask,
				};
			})
			.filter((entry): entry is ArticleWithPlayerTask => entry !== null);
	} catch (error) {
		console.error("Error querying articles with player task", error);
		return [];
	}
}

export async function saveTasks(url: string, tasks: Task[]): Promise<void> {
	const database = await getDb();
	const tasksJson = JSON.stringify(tasks);

	await database.execute(
		`INSERT INTO articles (url, tasks)
		 VALUES ($1, $2)
		 ON CONFLICT(url) DO UPDATE SET tasks = excluded.tasks`,
		[url, tasksJson],
	);
}

// delete task
export async function deleteArticle(url: string): Promise<void> {
	const database = await getDb();
	await database.execute(`DELETE FROM articles WHERE url = $1`, [url]);
}
