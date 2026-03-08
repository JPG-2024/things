import { buildTaskSubroutine } from "@/runners/taskBuilder";
import { taskRunner } from "@/runners/taskRunner.svelte";
import type { Task } from "@/types/taskRunner.types";
import { getArticleWithTasksByUrl, saveTasks, type ArticleWithTasks } from "@/stores/tasksStore";
import { viewState } from "@/stores/viewStore.svelte";
import type { TTSLanguage } from "$lib/utils/tts";
import { TaskNames, type YouTubeTaskId, youtubeTaskRegistry } from "@/runners/youtube/tasks";

const ytVideoTasksIds: YouTubeTaskId[] = [
	TaskNames.THUMBNAIL,
	TaskNames.MAIN_COLOR,
	TaskNames.VIDEO_INFO,
	TaskNames.CHAPTERS,
	TaskNames.SUMMARY,
	TaskNames.TTS,
];

export async function youTubeRunner(
	url: string,
	language?: TTSLanguage,
	cachedArticle?: ArticleWithTasks | null,
): Promise<Task[]> {
	try {
		const selectedLanguage = language ?? viewState.language;
		const resolvedCachedArticle = cachedArticle ?? (await getArticleWithTasksByUrl(url));
		const tasks = await buildTaskSubroutine(
			ytVideoTasksIds,
			youtubeTaskRegistry,
			{ url, language: selectedLanguage },
			{ persistedTasks: resolvedCachedArticle?.persistedTasks },
		);
		taskRunner.setTasks(tasks);
		const runResult = await taskRunner.run();

		console.log("All tasks completed:", runResult);

		await saveTasks(url, runResult.tasks);

		console.log("Tasks saved to store and database.");

		return runResult.tasks;
	} catch (invokeErr) {
		throw new Error(`Error: ${invokeErr}`);
	}
}
