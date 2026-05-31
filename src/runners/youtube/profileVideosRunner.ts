import { buildTaskSubroutine } from '@/runners/taskBuilder';
import { workflowManager } from '@/runners/workflowManager.svelte';
import type { Task } from '@/types/taskRunner.types';
import { viewState } from '@/stores/viewStore.svelte';
import { TaskNames, youtubeTaskRegistry } from '@/runners/youtube/tasks/youtubeTasks';

const fromUrlRoutine: TaskNames[] = [TaskNames.INIT_YOUTUBE_PROFILE, TaskNames.EXTRACT_PROFILE];

export async function youtubeProfileRunner(
	url: string,
	videosAmount: number = 1,
	profileId?: string
): Promise<Task[]> {
	try {
		const tasks = await buildTaskSubroutine(fromUrlRoutine, youtubeTaskRegistry, {
			url,
			language: viewState.language,
			videosAmount,
			profileId
		});

		const runResult = await workflowManager.run(url, tasks, {
			makeActive: false,
			stream: false,
			profile: profileId
		});

		const completedTasks = runResult.tasks as Task[];

		return completedTasks;
	} catch (invokeErr) {
		throw new Error(`Error: ${invokeErr}`);
	}
}

export const extractProfileRunner = youtubeProfileRunner;
