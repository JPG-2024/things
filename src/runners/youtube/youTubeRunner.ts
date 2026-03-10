import { buildTaskSubroutine } from "@/runners/taskBuilder";
import { taskRunner } from "@/runners/taskRunner.svelte";
import type { Task } from "@/types/taskRunner.types";
import { getArticleWithTasksByUrl, saveTasks, type ArticleWithTasks } from "@/stores/tasksStore";
import { viewState } from "@/stores/viewStore.svelte";
import { TaskNames, type YouTubeTaskId, youtubeTaskRegistry } from "@/runners/youtube/youtubeTasks";

const videoPage: YouTubeTaskId[] = [
	TaskNames.TITLE_SUMMARY,
	TaskNames.THUMBNAIL,
	TaskNames.MAIN_COLOR,
	TaskNames.VIDEO_INFO,
	TaskNames.CHAPTERS_SUMMARY,
	TaskNames.SUMMARY,
	TaskNames.KEY_POINTS,
	//TaskNames.TTS,
];

const videoItem: YouTubeTaskId[] = [
	TaskNames.TITLE_SUMMARY,
	TaskNames.THUMBNAIL,
	TaskNames.VIDEO_INFO,
];

const routine = {
	videoPage,
	videoItem,
}

export async function youTubeRunner(
	url: string,
	cachedArticle?: ArticleWithTasks | null,
	routineName: keyof typeof routine = "videoPage",
): Promise<Task[]> {
	try {
		const resolvedCachedArticle = cachedArticle ?? (await getArticleWithTasksByUrl(url));
		const tasks = await buildTaskSubroutine(
			routine[routineName],
			youtubeTaskRegistry,
			{ url, language: viewState.language },
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
