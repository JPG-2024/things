import type { Task } from '@/types/taskRunner.types';
import { TaskNames, youtubeTaskRegistry } from '@/runners/youtube/tasks/youtubeTasks';
import { createUrlRunner, type RunnerConfigBase } from '@/runners/urlRunnerBuilder';
import { saveTasks } from '@/stores/webStore';

const fromUrlRoutine: TaskNames[] = [
	TaskNames.INIT_YOUTUBE_PROFILE,
	TaskNames.EXTRACT_PROFILE,
	//TaskNames.EXTRACT_CHANNEL_VIDEOS,
	TaskNames.PROFILE_CATEGORY
];

const fromVideoRoutine: TaskNames[] = [TaskNames.EXTRACT_PROFILE, TaskNames.PROFILE_CATEGORY];

const routines = {
	fromUrl: fromUrlRoutine,
	fromVideo: fromVideoRoutine
};

interface ProfileRunnerOptions {
	videosAmount?: number;
	profileId?: string;
}

export interface ProfileRunnerCallConfig {
	runnerConfig?: RunnerConfigBase;
	options?: ProfileRunnerOptions;
}

let _runner: ReturnType<typeof createUrlRunner> | undefined;
function getRunner() {
	return (_runner ??= createUrlRunner({ taskRegistry: youtubeTaskRegistry, routines }));
}

export async function profileRunner(
	url: string,
	config?: ProfileRunnerCallConfig
): Promise<Task[]> {
	const { runnerConfig, options } = config ?? {};

	return getRunner()<ProfileRunnerOptions>({
		url,
		routine: runnerConfig?.routine ?? 'fromUrl',
		cachedTasks: runnerConfig?.cachedTasks,
		language: runnerConfig?.language,
		makeActive: runnerConfig?.makeActive,
		stream: runnerConfig?.stream,
		rebuild: runnerConfig?.rebuild,
		parentRunId: runnerConfig?.parentRunId,
		options,
		onRunResult: async (runResult) => {
			console.log('RESULT', runResult);

			await saveTasks(url, runResult.tasks);
			await runnerConfig?.onRunResult?.(runResult);
		}
	});
}
