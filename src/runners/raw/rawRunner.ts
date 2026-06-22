import { buildTaskSubroutine } from '@/runners/taskBuilder';
import { workflowManager } from '@/runners/workflowManager.svelte';
import { saveArticle, saveTasks } from '@/stores/webStore';
import { viewState } from '@/stores/viewStore.svelte';
import type { Task } from '@/types/taskRunner.types';
import { RawTaskNames, rawTaskRegistry } from './tasks/rawWorkflow';

type RawTaskId = keyof typeof rawTaskRegistry & string;

const defaultRoutine = [
	RawTaskNames.TITLE,
	RawTaskNames.CONTENT,
	RawTaskNames.TITLE_SUMMARY,
	RawTaskNames.GENERATE_TTS
] as const satisfies readonly RawTaskId[];

type RawRunnerOptions = {
	makeActive?: boolean;
	Rebuild?: boolean;
};

const RAW_TEXT_PROFILE = 'raw-text';

export async function rawRunner(
	rawId: string,
	rawText: string,
	options: RawRunnerOptions = {}
): Promise<Task[]> {
	const runId = rawId;
	const freshRun = options.Rebuild === true;

	const tasks = await buildTaskSubroutine(
		defaultRoutine,
		rawTaskRegistry,
		{ rawText, rawId, language: viewState.language, freshRun },
		{
			Rebuild: options.Rebuild
		}
	);

	const runResult = await workflowManager.run(runId, tasks, {
		makeActive: options.makeActive ?? true,
		Rebuild: options.Rebuild
	});

	await Promise.all([
		saveArticle(rawId, runResult.tasks, {
			profile: RAW_TEXT_PROFILE
		}),
		saveTasks(rawId, runResult.tasks)
	]);

	return runResult.tasks as Task[];
}
