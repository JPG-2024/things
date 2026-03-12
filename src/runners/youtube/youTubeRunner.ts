import { buildTaskSubroutine } from "@/runners/taskBuilder";
import {
	buildWorkflowRunId,
	workflowManager,
} from "@/runners/workflowManager.svelte";
import type { Task } from "@/types/taskRunner.types";
import { saveTasks, type ArticleWithTasks } from "@/stores/tasksStore";
import { viewState } from "@/stores/viewStore.svelte";
import {
	TaskNames,
	youtubeTaskRegistry,
} from "@/runners/youtube/tasks/youtubeTasks";

const videoPage: TaskNames[] = [
	TaskNames.THUMBNAIL,
	//TaskNames.MAIN_COLOR,
	TaskNames.VIDEO_INFO,
	//TaskNames.CHAPTERS_SUMMARY,
	TaskNames.SUMMARY,
	TaskNames.KEY_POINTS,
	//TaskNames.TTS,
];

const videoItem: TaskNames[] = [
	TaskNames.TITLE_SUMMARY,
	TaskNames.THUMBNAIL,
	TaskNames.VIDEO_INFO,
	//TaskNames.TTS,
];

const routine = {
	videoPage,
	videoItem,
};

type YouTubeRunnerOptions = {
	makeActive?: boolean;
	parentRunId?: string;
	routine?: keyof typeof routine;
};

export async function youTubeRunner(
	url: string,
	cachedArticle?: ArticleWithTasks | null,
	options: YouTubeRunnerOptions = {}
): Promise<Task[]> {
	const runId = buildWorkflowRunId("youtube-video", url);

	const tasks = await buildTaskSubroutine(
		routine[options.routine ?? "videoPage"],
		youtubeTaskRegistry,
		{ url, language: viewState.language },
		{ persistedTasks: cachedArticle?.persistedTasks }
	);

	const runResult = await workflowManager.run(runId, tasks, {
		makeActive: options.makeActive ?? true,
		parentRunId: options.parentRunId,
	});

	await saveTasks(url, runResult.tasks);
	return runResult.tasks as Task[];
}
