import { buildTaskSubroutine } from '@/runners/taskBuilder';
import { workflowManager } from '@/runners/workflowManager.svelte';
import { saveTasks, type ArticleWithTasks } from '@/stores/webStore';
import { viewState } from '@/stores/viewStore.svelte';
import type { Task } from '@/types/taskRunner.types';
import { WebTaskNames, webTaskRegistry } from './tasks/webWorkflow';
import type { InferTaskState } from '@/runners/taskSchema';

type WebTaskId = keyof typeof webTaskRegistry & string;

const webPage = [
	WebTaskNames.THUMBNAIL,
	WebTaskNames.TITLE,
	WebTaskNames.CONTENT,
	WebTaskNames.TITLE_SUMMARY
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
	cachedArticle?: ArticleWithTasks | null,
	options: WebRunnerOptions = {}
): Promise<Task[]> {
	const runId = url;
	const freshRun = options.Rebuild === true || !cachedArticle?.persistedTasks?.length;

	const tasks = await buildTaskSubroutine(
		routine[options.routine ?? 'webPage'],
		webTaskRegistry,
		{ url, language: viewState.language, freshRun },
		{
			persistedTasks: cachedArticle?.persistedTasks,
			Rebuild: options.Rebuild
		}
	);

	const runResult = await workflowManager.run(runId, tasks, {
		makeActive: options.makeActive ?? true,
		parentRunId: options.parentRunId,
		Rebuild: options.Rebuild
	});

	await saveTasks(url, runResult.tasks, {
		profile: viewState.domainUrl,
		profilePicture: `https://www.google.com/s2/favicons?sz=64&domain=${viewState.domainUrl}`
	});
	return runResult.tasks as Task[];
}
