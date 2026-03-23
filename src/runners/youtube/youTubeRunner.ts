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
	TaskNames.CHAPTERS_SUMMARY,
	TaskNames.KEYWORDS,
	TaskNames.KEYPOINTS,
	TaskNames.SUMMARY,
	//TaskNames.TTS,
];

const videoItem: TaskNames[] = [
	TaskNames.THUMBNAIL,
	TaskNames.VIDEO_INFO,
	TaskNames.TITLE_SUMMARY,
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
	Rebuild?: boolean;
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
		{
			persistedTasks: cachedArticle?.persistedTasks,
			Rebuild: options.Rebuild,
		}
	);

	const runResult = await workflowManager.run(runId, tasks, {
		makeActive: options.makeActive ?? true,
		parentRunId: options.parentRunId,
		Rebuild: options.Rebuild,
	});

	await saveTasks(url, runResult.tasks);
	return runResult.tasks as Task[];
}
