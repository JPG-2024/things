import { buildTaskSubroutine } from '@/runners/taskBuilder';
import { workflowManager } from '@/runners/workflowManager.svelte';
import { saveArticle, saveTasks, type PersistedTaskState } from '@/stores/webStore';
import { viewState } from '@/stores/viewStore.svelte';
import type { Task } from '@/types/taskRunner.types';
import { WebTaskNames, webTaskRegistry } from './tasks/webWorkflow';

type WebTaskId = keyof typeof webTaskRegistry & string;

const webPage = [
	WebTaskNames.THUMBNAIL,
	WebTaskNames.TITLE,
	WebTaskNames.CONTENT,
	WebTaskNames.TITLE_SUMMARY,
	WebTaskNames.GENERATE_TTS
] as const satisfies readonly WebTaskId[];

const quickArticle = [
	WebTaskNames.THUMBNAIL,
	WebTaskNames.TITLE,
	WebTaskNames.CONTENT,
	WebTaskNames.TITLE_SUMMARY,
	WebTaskNames.KEYWORDS
] as const satisfies readonly WebTaskId[];

const minimalArticle = [
	WebTaskNames.TITLE,
	WebTaskNames.CONTENT,
	WebTaskNames.TITLE_SUMMARY
] as const satisfies readonly WebTaskId[];

const routine = {
	webPage,
	quickArticle,
	minimalArticle
};

type WebRunnerOptions = {
	makeActive?: boolean;
	parentRunId?: string;
	routine?: keyof typeof routine;
	Rebuild?: boolean;
};

export async function webRunner(
	url: string,
	cachedTasks?: PersistedTaskState[] | null,
	options: WebRunnerOptions = {}
): Promise<Task[]> {
	const runId = url;
	const freshRun = options.Rebuild === true || !cachedTasks?.length;

	const tasks = await buildTaskSubroutine(
		routine[options.routine ?? 'webPage'],
		webTaskRegistry,
		{ url, language: viewState.language, freshRun },
		{
			persistedTasks: cachedTasks ?? undefined,
			Rebuild: options.Rebuild
		}
	);

	const runResult = await workflowManager.run(runId, tasks, {
		makeActive: options.makeActive ?? true,
		parentRunId: options.parentRunId,
		Rebuild: options.Rebuild
	});

	await Promise.all([
		saveArticle(url, runResult.tasks, {
			profile: viewState.domainUrl,
			profilePicture: `https://www.google.com/s2/favicons?sz=64&domain=${viewState.domainUrl}`
		}),
		saveTasks(url, runResult.tasks)
	]);
	return runResult.tasks as Task[];
}
