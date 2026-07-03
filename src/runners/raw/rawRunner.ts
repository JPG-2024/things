import { buildTaskSubroutine } from '@/runners/taskBuilder';
import { workflowManager } from '@/runners/workflowManager.svelte';
import { saveArticle, saveTasks, type PersistedTaskState } from '@/stores/webStore';
import { viewState } from '@/stores/viewStore.svelte';
import type { Task } from '@/types/taskRunner.types';
import { TaskNames, rawTaskRegistry } from './tasks/rawWorkflow';

type RawTaskId = keyof typeof rawTaskRegistry & string;

const defaultRoutine = [
	TaskNames.TITLE,
	TaskNames.CONTENT,
	TaskNames.KEYWORDS,
	TaskNames.CATEGORY,
	TaskNames.TITLE_SUMMARY
	//TaskNames.GENERATE_TTS
] as const satisfies readonly RawTaskId[];

type RawRunnerOptions = {
	makeActive?: boolean;
	Rebuild?: boolean;
	cachedTasks?: PersistedTaskState[];
};

const RAW_TEXT_PROFILE = 'raw-text';

export async function rawRunner(
	rawId: string,
	rawText: string,
	options: RawRunnerOptions = {}
): Promise<Task[]> {
	const runId = rawId;
	const freshRun = !options.cachedTasks?.length;

	const tasks = await buildTaskSubroutine(
		defaultRoutine,
		rawTaskRegistry,
		{ rawText, rawId, language: viewState.language, freshRun },
		{
			persistedTasks: options.cachedTasks,
			Rebuild: options.Rebuild
		}
	);

	const runResult = await workflowManager.run(runId, tasks, {
		makeActive: options.makeActive ?? true,
		Rebuild: options.Rebuild
	});

	await Promise.all([saveArticle(rawId, runResult.tasks), saveTasks(rawId, runResult.tasks)]);

	return runResult.tasks as Task[];
}
