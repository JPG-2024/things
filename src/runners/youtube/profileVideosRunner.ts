import { runTemplateWorkflow } from '@/runners/templateRunner';
import { saveTasks, type PersistedTaskState } from '@/stores/webStore';
import { viewState } from '@/stores/viewStore.svelte';
import type { Task } from '@/types/taskRunner.types';

interface ProfileRunnerOptions {
	videosAmount?: number;
	profileId?: string;
	scrollTimes?: number;
}

export interface ProfileRunnerCallConfig {
	cachedTasks?: PersistedTaskState[] | null;
	makeActive?: boolean;
	Rebuild?: boolean;
	options?: ProfileRunnerOptions;
}

function buildProfileInitialTasks(url: string, options?: ProfileRunnerOptions): Task[] {
	const initTask: Task = {
		id: 'init-youtube-profile',
		name: 'Initialize YouTube Profile',
		dependencies: [],
		type: 'script',
		persist: true,
		run: () => {
			const urlObj = new URL(url);
			const profileId = (options?.profileId || urlObj.pathname.split('/')[1]).toLowerCase();
			const profileUrl = `https://www.youtube.com/${profileId}/videos`;
			return {
				url: profileUrl,
				videoId: null,
				language: viewState.language,
				profileId,
				videosAmount: options?.videosAmount
			};
		}
	};

	return [initTask];
}

export async function profileRunner(
	url: string,
	config?: ProfileRunnerCallConfig
): Promise<Task[]> {
	const { options } = config ?? {};
	const initialTasks = buildProfileInitialTasks(url, options);

	return runTemplateWorkflow(url, '', initialTasks, {
		makeActive: config?.makeActive ?? true,
		Rebuild: config?.Rebuild,
		cachedTasks: config?.cachedTasks ?? undefined,
		onRunResult: async (runResult) => {
			await saveTasks(url, runResult.tasks);
		}
	});
}
