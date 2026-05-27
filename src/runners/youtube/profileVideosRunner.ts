import { buildTaskSubroutine } from '@/runners/taskBuilder';
import { buildWorkflowRunId, workflowManager } from '@/runners/workflowManager.svelte';
import type { Task } from '@/types/taskRunner.types';
import { saveProfile } from '@/stores/tasksStore';
import { viewState } from '@/stores/viewStore.svelte';
import { TaskNames, youtubeTaskRegistry } from '@/runners/youtube/tasks/youtubeTasks';

const profileTasks: TaskNames[] = [
	TaskNames.INIT,
	TaskNames.EXTRACT_PROFILE,
	TaskNames.GET_CHANNEL_VIDEOS,
	TaskNames.EXTRACT_CHANNEL_VIDEOS
];

export async function youtubeProfileRunner(url: string): Promise<Task[]> {
	try {
		const tasks = await buildTaskSubroutine(profileTasks, youtubeTaskRegistry, {
			url,
			language: viewState.language
		});

		const runResult = await workflowManager.run(url, tasks, {
			makeActive: false,
			stream: false
		});

		const completedTasks = runResult.tasks as unknown as Task[];

		const extractProfileTask = completedTasks.find((t) => t.id === TaskNames.EXTRACT_PROFILE);

		const extractChannelVideosTask = completedTasks.find(
			(t) => t.id === TaskNames.EXTRACT_CHANNEL_VIDEOS
		);

		const lastVideoDate =
			extractChannelVideosTask?.data && typeof extractChannelVideosTask.data === 'object'
				? ((extractChannelVideosTask.data as { lastVideoDate?: string | null }).lastVideoDate ??
					null)
				: null;

		if (extractProfileTask?.data && typeof extractProfileTask.data === 'object') {
			const profileData = extractProfileTask.data as { name?: string; profilePicture?: string };
			if (profileData.name) {
				await saveProfile(profileData.name, profileData.profilePicture ?? null, lastVideoDate);
			}
		}

		return completedTasks;
	} catch (invokeErr) {
		throw new Error(`Error: ${invokeErr}`);
	}
}

export const extractProfileRunner = youtubeProfileRunner;
