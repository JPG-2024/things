import { runTemplateWorkflow } from '@/runners/templateRunner';
import { saveArticle, saveTasks, type PersistedTaskState } from '@/stores/webStore';
import { viewState } from '@/stores/viewStore.svelte';
import type { Task } from '@/types/taskRunner.types';
import { EMBEDDING_MODEL } from '@/lib/utils/inference/constants';
import { generateEmbeddingsFromTasks } from '@/lib/utils/embeddingTasks';

type RawRunnerOptions = {
	makeActive?: boolean;
	Rebuild?: boolean;
	cachedTasks?: PersistedTaskState[];
};

const RAW_TEXT_PROFILE = 'raw-text';

function buildRawContentTask(rawId: string, rawText: string): Task {
	return {
		id: 'content',
		name: 'Content',
		dependencies: [],
		type: 'script',
		component: 'ask',
		persist: true,
		run: () => rawText
	};
}

export async function rawRunner(
	rawId: string,
	rawText: string,
	options: RawRunnerOptions = {}
): Promise<Task[]> {
	const initialTasks = [buildRawContentTask(rawId, rawText)];

	return runTemplateWorkflow(rawId, RAW_TEXT_PROFILE, initialTasks, {
		makeActive: options.makeActive ?? true,
		Rebuild: options.Rebuild,
		cachedTasks: options.cachedTasks,
		onRunResult: async (runResult) => {
			await Promise.all([saveArticle(rawId, runResult.tasks), saveTasks(rawId, runResult.tasks)]);

			if (viewState.embeddingsEnabled) {
				await generateEmbeddingsFromTasks(runResult.tasks, rawId, {
					model: EMBEDDING_MODEL,
					profileId: RAW_TEXT_PROFILE
				});
			}
		}
	});
}
