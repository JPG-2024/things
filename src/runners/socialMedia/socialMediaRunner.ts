import { runTemplateWorkflow } from '@/runners/templateRunner';
import { saveArticle, saveProfile, saveTasks, type PersistedTaskState } from '@/stores/webStore';
import { stripQueryParams } from '@/lib/utils/url';
import { viewState } from '@/stores/viewStore.svelte';
import { createDefaultTasks } from '@/runners/shared/sharedTasks';
import type { Task } from '@/types/taskRunner.types';
import { transcribeLink } from '@/lib/utils/ttsService';
import { EMBEDDING_MODEL } from '@/lib/utils/inference/constants';
import { extractCategoryFromTasks, generateEmbeddingsFromTasks } from '@/lib/utils/embeddingTasks';

export type SocialMediaPlatform = 'tiktok' | 'instagram';

export interface SocialMediaRunnerOptions {
	profileId?: string;
}

export interface SocialMediaRunnerCallConfig {
	options?: SocialMediaRunnerOptions;
	cachedTasks?: PersistedTaskState[] | null;
	Rebuild?: boolean;
	makeActive?: boolean;
}

function extractProfileId(url: string): string | null {
	try {
		const urlObj = new URL(url);
		const handleMatch = urlObj.pathname.match(/@([\w.-]+)/);
		if (handleMatch) return handleMatch[1];
		return urlObj.hostname;
	} catch {
		return null;
	}
}

function buildSocialMediaInitialTasks(cleanUrl: string, platform: SocialMediaPlatform): Task[] {
	const initTask: Task = {
		id: 'init-social',
		name: `Initialize ${platform}`,
		dependencies: [],
		type: 'script',
		run: () => ({ url: cleanUrl, platform, language: viewState.language })
	};

	const transcribeTask: Task = {
		id: 'transcribe',
		name: 'Transcribe',
		dependencies: ['init-social'],
		type: 'script',
		persist: true,
		run: async () => {
			const result = await transcribeLink(cleanUrl);
			return result;
		}
	};

	const contentTask: Task = {
		id: 'content',
		name: 'Content',
		dependencies: ['transcribe'],
		type: 'script',
		component: 'ask',
		persist: true,
		renderOrder: 999,
		run: (runtime) => {
			const transcription = runtime.getTaskData('transcribe') as { text: string };
			return transcription?.text?.trim() ?? '';
		}
	};

	return [initTask, transcribeTask, contentTask];
}

export async function socialMediaRunner(
	url: string,
	platform: SocialMediaPlatform,
	config?: SocialMediaRunnerCallConfig
): Promise<Task[]> {
	const cleanUrl = stripQueryParams(url);
	const { options } = config ?? {};

	const profileId = options?.profileId ?? extractProfileId(cleanUrl) ?? platform;
	const initialTasks = buildSocialMediaInitialTasks(cleanUrl, platform);

	return runTemplateWorkflow(cleanUrl, profileId, initialTasks, {
		makeActive: config?.makeActive ?? true,
		Rebuild: config?.Rebuild,
		cachedTasks: config?.cachedTasks,
		defaultTasksFactory: () => createDefaultTasks('content'),
		onRunResult: async (runResult) => {
			const saveOperations: Promise<unknown>[] = [
				saveArticle(cleanUrl, runResult.tasks, { profile: profileId }),
				saveTasks(cleanUrl, runResult.tasks)
			];

			if (profileId) {
				let faviconDomain: string;
				try {
					faviconDomain = new URL(cleanUrl).hostname;
				} catch {
					faviconDomain = profileId;
				}
				const profilePicture = `https://www.google.com/s2/favicons?sz=64&domain=${faviconDomain}`;
				saveOperations.push(saveProfile(profileId, profilePicture, null, faviconDomain));
			}

			await Promise.all(saveOperations);

			if (viewState.embeddingsEnabled) {
				await generateEmbeddingsFromTasks(runResult.tasks, cleanUrl, {
					model: EMBEDDING_MODEL,
					profileId,
					category: extractCategoryFromTasks(runResult.tasks)
				});
			}
		}
	});
}
