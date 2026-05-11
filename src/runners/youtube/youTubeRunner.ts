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
	TaskNames.VIDEO_INFO,
	TaskNames.SUMMARY,
	//TaskNames.MAIN_COLOR,
	//TaskNames.KEYWORDS,
	//TaskNames.KEYPOINTS,
	//TaskNames.CHAPTERS_SUMMARY,
];

const videoItem: TaskNames[] = [
	TaskNames.THUMBNAIL,
	TaskNames.TITLE_SUMMARY,
	TaskNames.TITLE,
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
	stream?: boolean;
	profile?: string;
};

export async function youTubeRunner(
	url: string,
	cachedArticle?: ArticleWithTasks | null,
	options: YouTubeRunnerOptions = {}
): Promise<Task[]> {
	const runId = buildWorkflowRunId("youtube-video", url);
	const freshRun =
		options.Rebuild === true || !cachedArticle?.persistedTasks?.length;

	// Build the task list based on the selected routine and registry, incorporating persisted task states if available, and marking the run as fresh if Rebuild is true or no persisted tasks are found
	const tasks = await buildTaskSubroutine(
		routine[options.routine ?? "videoPage"],
		youtubeTaskRegistry,
		{ url, language: viewState.language, freshRun },
		{
			persistedTasks: cachedArticle?.persistedTasks,
			Rebuild: options.Rebuild,
		}
	);

	const runResult = await workflowManager.run(runId, tasks, {
		makeActive: options.makeActive ?? true,
		parentRunId: options.parentRunId,
		Rebuild: options.Rebuild,
		stream: options.stream,
	});

	await saveTasks(url, runResult.tasks, { profile: options.profile });
	return runResult.tasks as Task[];
}
