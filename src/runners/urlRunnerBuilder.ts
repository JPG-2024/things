import { buildTaskSubroutine } from '@/runners/taskBuilder';
import { workflowManager } from '@/runners/workflowManager.svelte';
import type { Task, TaskRunSummary } from '@/types/taskRunner.types';
import type { PersistedTaskState } from '@/stores/webStore';
import type { TTSLanguage } from '@/lib/utils/tts';
import { viewState } from '@/stores/viewStore.svelte';

export interface CachedWithTasks {
	persistedTasks?: PersistedTaskState[];
}

export interface UrlRunnerConfig<TOptions = Record<string, never>> {
	url: string;
	routine: string | ((freshRun: boolean) => string);
	cached?: CachedWithTasks | null;
	language?: TTSLanguage;
	makeActive?: boolean;
	stream?: boolean;
	rebuild?: boolean;
	parentRunId?: string;
	options?: TOptions;
	onRunResult?: (runResult: TaskRunSummary) => void | Promise<void>;
}

export type RunnerConfigBase = Omit<UrlRunnerConfig, 'url' | 'options'>;

type TaskRegistry = Record<string, unknown>;
type RoutineMap = Record<string, ReadonlyArray<string>>;

export function createUrlRunner(config: {
	taskRegistry: TaskRegistry;
	routines: RoutineMap;
}): <TOptions = Record<string, never>>(config: UrlRunnerConfig<TOptions>) => Promise<Task[]> {
	const { taskRegistry, routines } = config;

	return async (runnerConfig) => {
		const freshRun = runnerConfig.rebuild ?? !runnerConfig.cached?.persistedTasks?.length;

		const routineId =
			typeof runnerConfig.routine === 'function'
				? runnerConfig.routine(freshRun)
				: runnerConfig.routine;

		const routineTasks = routines[routineId];
		if (!routineTasks) {
			throw new Error(`Unknown routine: ${routineId}`);
		}

		const context = {
			url: runnerConfig.url,
			language: runnerConfig.language ?? viewState.language,
			freshRun,
			...runnerConfig.options
		};

		const tasks: Task[] = await buildTaskSubroutine(routineTasks, taskRegistry, context, {
			persistedTasks: runnerConfig.cached?.persistedTasks,
			Rebuild: runnerConfig.rebuild
		});

		const runResult = await workflowManager.run(runnerConfig.url, tasks, {
			makeActive: runnerConfig.makeActive ?? true,
			parentRunId: runnerConfig.parentRunId,
			Rebuild: runnerConfig.rebuild,
			stream: runnerConfig.stream
		});

		if (runnerConfig.onRunResult) {
			await runnerConfig.onRunResult(runResult);
		}

		return runResult.tasks as Task[];
	};
}
