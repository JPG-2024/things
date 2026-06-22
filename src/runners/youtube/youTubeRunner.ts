import type { Task } from '@/types/taskRunner.types';
import { saveArticle, saveTasks } from '@/stores/webStore';
import { TaskNames, youtubeTaskRegistry } from '@/runners/youtube/tasks/youtubeTasks';
import { removeYTTimeParam } from '@/lib/utils/youtube/helpers';
import { getTaskData } from '@/lib/utils/helpers/tasks';
import { createUrlRunner, type RunnerConfigBase } from '@/runners/urlRunnerBuilder';
import { drawersState } from '@/stores/viewStore.svelte';

const fromUrl: TaskNames[] = [
	TaskNames.THUMBNAIL,
	TaskNames.VIDEO_INFO,
	TaskNames.TITLE,
	TaskNames.KEYWORDS,
	TaskNames.CATEGORY,
	TaskNames.TITLE_SUMMARY,
	//TaskNames.CHAPTERS_SUMMARY,
	TaskNames.PROFILE_FROM_VIDEO,
	//TaskNames.KEYPOINTS,
	TaskNames.GENERATE_TTS
];

const fromFreshUrl: TaskNames[] = [...fromUrl, TaskNames.PROFILE_FROM_VIDEO];

const fromProfileRunner: TaskNames[] = [
	TaskNames.THUMBNAIL
	//TaskNames.TITLE_SUMMARY,
	//TaskNames.TITLE
];

const previewRoutine: TaskNames[] = [TaskNames.THUMBNAIL];

const fromCloneVoice: TaskNames[] = [TaskNames.VIDEO_INFO, TaskNames.PROFILE_FROM_VIDEO];

const routines = {
	fromUrl,
	fromFreshUrl,
	fromProfileRunner,
	previewRoutine,
	fromCloneVoice
};

interface YouTubeRunnerOptions {
	profileId?: string;
}

export interface YouTubeRunnerCallConfig {
	runnerConfig?: RunnerConfigBase;
	options?: YouTubeRunnerOptions;
}

let _ytRunner: ReturnType<typeof createUrlRunner> | undefined;
function getYtRunner() {
	return (_ytRunner ??= createUrlRunner({ taskRegistry: youtubeTaskRegistry, routines }));
}

export async function youTubeRunner(
	url: string,
	config?: YouTubeRunnerCallConfig
): Promise<Task[]> {
	const cleanUrl = removeYTTimeParam(url);
	const { runnerConfig, options } = config ?? {};

	const fromCloneVoice = drawersState.isOpen('tts-settings');
	const routine = fromCloneVoice ? 'fromCloneVoice' : (runnerConfig?.routine ?? 'fromUrl');

	return getYtRunner()<YouTubeRunnerOptions>({
		url: cleanUrl,
		routine,
		cachedTasks: runnerConfig?.cachedTasks,
		language: runnerConfig?.language,
		makeActive: runnerConfig?.makeActive,
		stream: runnerConfig?.stream,
		rebuild: runnerConfig?.rebuild,
		parentRunId: runnerConfig?.parentRunId,
		options,
		onRunResult: async (runResult) => {
			if (fromCloneVoice) return;

			const profileId =
				options?.profileId || getTaskData(runResult.tasks, 'video-info', 'profileId');
			const saveOperations: Promise<unknown>[] = [
				saveArticle(cleanUrl, runResult.tasks, { profile: profileId }),
				saveTasks(cleanUrl, runResult.tasks)
			];

			await Promise.all(saveOperations);
			await runnerConfig?.onRunResult?.(runResult);
		}
	});
}
