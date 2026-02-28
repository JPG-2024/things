import Database from "@tauri-apps/plugin-sql";
import type { Task } from "@/types/taskRunner.types";

let db: Database | null = null;

async function getDb() {
	if (!db) {
		db = await Database.load("sqlite:notian.db");
	}
	return db;
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
