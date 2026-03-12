import { buildTaskSubroutine } from "@/runners/taskBuilder";
import {
	buildWorkflowRunId,
	workflowManager,
} from "@/runners/workflowManager.svelte";
import type { Task } from "@/types/taskRunner.types";

import { viewState } from "@/stores/viewStore.svelte";
import {
	TaskNames,
	youtubeTaskRegistry,
} from "@/runners/youtube/tasks/youtubeTasks";

const profileTasks: TaskNames[] = [
	TaskNames.INIT,
	TaskNames.GET_CHANNEL_VIDEOS,
	TaskNames.EXTRACT_CHANNEL_VIDEOS,
];

export async function extractProfileRunner(url: string): Promise<Task[]> {
	try {
		const runId = buildWorkflowRunId("youtube-profile", url);
		const tasks = await buildTaskSubroutine(profileTasks, youtubeTaskRegistry, {
			url,
			language: viewState.language,
		});
		const runResult = await workflowManager.run(runId, tasks, {
			makeActive: true,
			stream: false,
		});

		console.log("All tasks completed:", runResult);

		return runResult.tasks as unknown as Task[];
	} catch (invokeErr) {
		throw new Error(`Error: ${invokeErr}`);
	}
}
