import { buildTaskSubroutine } from "@/runners/taskBuilder";
import { taskRunner } from "@/runners/taskRunner.svelte";
import type { Task } from "@/types/taskRunner.types";

import { viewState } from "@/stores/viewStore.svelte";
import {
	TaskNames,
	type YouTubeTaskId,
	youtubeTaskRegistry,
} from "@/runners/youtube/youtubeTasks";

const profileTasks: YouTubeTaskId[] = [
	TaskNames.INIT,
	TaskNames.GET_CHANNEL_VIDEOS,
	TaskNames.EXTRACT_CHANNEL_VIDEOS,
];

export async function extractProfileRunner(url: string): Promise<Task[]> {
	try {
		const tasks = await buildTaskSubroutine(profileTasks, youtubeTaskRegistry, {
			url,
			language: viewState.language,
		});
		taskRunner.setTasks(tasks);
		const runResult = await taskRunner.run();

		console.log("All tasks completed:", runResult);

		return runResult.tasks;
	} catch (invokeErr) {
		throw new Error(`Error: ${invokeErr}`);
	}
}
