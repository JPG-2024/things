import type { Task } from '@/types/taskRunner.types';
import { saveArticle, saveTasks } from '@/stores/webStore';
import { TaskNames, youtubeTaskRegistry } from '@/runners/youtube/tasks/youtubeTasks';
import { removeYTTimeParam } from '@/lib/utils/youtube/helpers';
import { createUrlRunner, type RunnerConfigBase } from '@/runners/urlRunnerBuilder';

const fromUrl: TaskNames[] = [
	TaskNames.THUMBNAIL,
	TaskNames.TITLE,
	TaskNames.KEYWORDS,
	TaskNames.CATEGORY,
	TaskNames.TITLE_SUMMARY,
	TaskNames.EMOJIS
];

const fromFreshUrl: TaskNames[] = [...fromUrl];

const fromProfileRunner: TaskNames[] = [TaskNames.THUMBNAIL];

const fromProfile: TaskNames[] = [
	TaskNames.THUMBNAIL,
	TaskNames.TITLE,
	TaskNames.KEYWORDS,
	TaskNames.CATEGORY,
	TaskNames.TITLE_SUMMARY
];

const previewRoutine: TaskNames[] = [TaskNames.THUMBNAIL];

const routines = {
	fromUrl,
	fromFreshUrl,
	fromProfile,
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
		cachedTasks: runnerConfig?.cachedTasks,
		language: runnerConfig?.language,
		makeActive: runnerConfig?.makeActive,
		stream: runnerConfig?.stream,
		rebuild: runnerConfig?.rebuild,
		parentRunId: runnerConfig?.parentRunId,
		options,
		onRunResult: async (runResult) => {
			const profileId = options?.profileId;
			const saveOperations: Promise<unknown>[] = [
				saveArticle(cleanUrl, runResult.tasks, { profile: profileId }),
				saveTasks(cleanUrl, runResult.tasks)
			];

			await Promise.all(saveOperations);
			await runnerConfig?.onRunResult?.(runResult);
		}
	});
}
