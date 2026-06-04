import { buildTaskSubroutine } from '@/runners/taskBuilder';
import { workflowManager } from '@/runners/workflowManager.svelte';
import type { Task } from '@/types/taskRunner.types';
import { saveTasks, type ArticleWithTasks } from '@/stores/tasksStore';
import { viewState } from '@/stores/viewStore.svelte';
import { TaskNames, youtubeTaskRegistry } from '@/runners/youtube/tasks/youtubeTasks';
import { removeYTTimeParam } from '@/lib/utils/youtube/helpers';
import { youtubeProfileRunner } from './profileVideosRunner';
import { getTaskData } from '@/lib/utils/helpers/tasks';

const fromUrl: TaskNames[] = [
	TaskNames.THUMBNAIL,
	TaskNames.VIDEO_INFO,
	TaskNames.TITLE_SUMMARY,
	TaskNames.GENERATE_TTS,
	TaskNames.TITLE,
	TaskNames.CHAPTERS_SUMMARY
];

const fromFreshUrl: TaskNames[] = [...fromUrl, TaskNames.PROFILE_FROM_VIDEO];

const fromProfileRunner: TaskNames[] = [
	TaskNames.THUMBNAIL,
	TaskNames.TITLE_SUMMARY,
	TaskNames.TITLE
];

const previewRoutine: TaskNames[] = [TaskNames.THUMBNAIL];

const routine = {
	fromUrl,
	fromFreshUrl,
	fromProfileRunner,
	previewRoutine
};

type YouTubeRunnerOptions = {
	makeActive?: boolean;
	parentRunId?: string;
	routine?: keyof typeof routine;
	Rebuild?: boolean;
	stream?: boolean;
	profileId?: string;
};

export async function youTubeRunner(
	url: string,
	cachedArticle?: ArticleWithTasks | null,
	options: YouTubeRunnerOptions = {}
): Promise<Task[]> {
	url = removeYTTimeParam(url);
	const runId = url;
	const freshRun = options.Rebuild === true || !cachedArticle?.persistedTasks?.length;

	const routineId = options.routine || (freshRun ? 'fromFreshUrl' : 'fromUrl');

	// Build the task list based on the selected routine and registry, incorporating persisted task states if available, and marking the run as fresh if Rebuild is true or no persisted tasks are found
	const tasks = await buildTaskSubroutine(
		routine[routineId],
		youtubeTaskRegistry,
		{ url, language: viewState.language, freshRun }, // params inyected to each task
		{
			persistedTasks: cachedArticle?.persistedTasks,
			Rebuild: options.Rebuild
		}
	);

	const runResult = await workflowManager.run(runId, tasks, {
		makeActive: options.makeActive ?? true,
		parentRunId: options.parentRunId,
		Rebuild: options.Rebuild,
		stream: options.stream
	});

	const profileId = options.profileId || getTaskData(runResult.tasks, 'video-info', 'profileId');

	await saveTasks(url, runResult.tasks, {
		profile: profileId
	});

	return runResult.tasks as Task[];
}
