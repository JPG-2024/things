import { runTemplateWorkflow } from '@/runners/templateRunner';
import {
	saveArticle,
	saveTasks,
	type PersistedTaskState,
	type ArticleFieldOverrides
} from '@/stores/webStore';
import { viewState } from '@/stores/viewStore.svelte';
import type { Task } from '@/types/taskRunner.types';
import { EMBEDDING_MODEL } from '@/lib/utils/inference/constants';
import { generateEmbeddingsFromTasks } from '@/lib/utils/embeddingTasks';

type RawRunnerOptions = {
	makeActive?: boolean;
	Rebuild?: boolean;
	cachedTasks?: PersistedTaskState[];
	templateId?: string;
	articleOverrides?: ArticleFieldOverrides;
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

	const result = await runTemplateWorkflow(rawId, RAW_TEXT_PROFILE, initialTasks, {
		makeActive: options.makeActive ?? true,
		Rebuild: options.Rebuild,
		cachedTasks: options.cachedTasks,
		templateId: options.templateId,
		articleOverrides: options.articleOverrides,
		onRunResult: async (runResult, { templateId, articleOverrides }) => {
			await Promise.all([
				saveArticle(rawId, runResult.tasks, { ...articleOverrides, templateId }),
				saveTasks(rawId, runResult.tasks)
			]);

			if (viewState.embeddingsEnabled) {
				await generateEmbeddingsFromTasks(runResult.tasks, rawId, {
					model: EMBEDDING_MODEL,
					profileId: RAW_TEXT_PROFILE
				});
			}
		}
	});

	return result.tasks;
}
