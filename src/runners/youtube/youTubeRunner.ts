import type { Task } from '@/types/taskRunner.types';
import { saveTasks } from '@/stores/tasksStore';
import { TaskNames, youtubeTaskRegistry } from '@/runners/youtube/tasks/youtubeTasks';
import { removeYTTimeParam } from '@/lib/utils/youtube/helpers';
import { getTaskData } from '@/lib/utils/helpers/tasks';
import { createUrlRunner, type RunnerConfigBase } from '@/runners/urlRunnerBuilder';

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

const routines = {
	fromUrl,
	fromFreshUrl,
	fromProfileRunner,
	previewRoutine
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

	return getYtRunner()<YouTubeRunnerOptions>({
		url: cleanUrl,
		routine: runnerConfig?.routine ?? 'fromUrl',
		cached: runnerConfig?.cached,
		language: runnerConfig?.language,
		makeActive: runnerConfig?.makeActive,
		stream: runnerConfig?.stream,
		rebuild: runnerConfig?.rebuild,
		parentRunId: runnerConfig?.parentRunId,
		options,
		onRunResult: async (runResult) => {
			const profileId =
				options?.profileId || getTaskData(runResult.tasks, 'video-info', 'profileId');
			await saveTasks(cleanUrl, runResult.tasks, { profile: profileId });
			await runnerConfig?.onRunResult?.(runResult);
		}
	});
}
