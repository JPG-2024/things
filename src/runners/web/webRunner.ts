import { buildTaskSubroutine } from "@/runners/taskBuilder";
import {
	buildWorkflowRunId,
	workflowManager,
} from "@/runners/workflowManager.svelte";
import { saveTasks, type ArticleWithTasks } from "@/stores/tasksStore";
import { viewState } from "@/stores/viewStore.svelte";
import type { Task } from "@/types/taskRunner.types";
import { WebTaskNames, webTaskRegistry } from "./tasks/webTasks";

const webPage: WebTaskNames[] = [
	WebTaskNames.THUMBNAIL,
	WebTaskNames.TITLE,
	WebTaskNames.CONTENT,
	WebTaskNames.SUMMARY,
];

const quickArticle: WebTaskNames[] = [
	WebTaskNames.THUMBNAIL,
	WebTaskNames.TITLE,
	WebTaskNames.CONTENT,
	WebTaskNames.SUMMARY,
	WebTaskNames.KEYWORDS,
];

const minimalArticle: WebTaskNames[] = [
	WebTaskNames.TITLE,
	WebTaskNames.CONTENT,
	WebTaskNames.SUMMARY,
];

const routine = {
	webPage,
	quickArticle,
	minimalArticle,
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
	const runId = buildWorkflowRunId("web-page", url);
	const freshRun =
		options.Rebuild === true || !cachedArticle?.persistedTasks?.length;

	const tasks = await buildTaskSubroutine(
		routine[options.routine ?? "webPage"],
		webTaskRegistry,
		{ url, language: viewState.language, freshRun },
		{
			persistedTasks: cachedArticle?.persistedTasks,
			Rebuild: options.Rebuild,
		}
	);

	const runResult = await workflowManager.run(runId, tasks, {
		makeActive: options.makeActive ?? true,
		parentRunId: options.parentRunId,
		Rebuild: options.Rebuild,
	});

	await saveTasks(url, runResult.tasks, {
		profile: viewState.domainUrl,
		profilePicture: `https://www.google.com/s2/favicons?sz=64&domain=${viewState.domainUrl}`,
	});
	return runResult.tasks as Task[];
}
