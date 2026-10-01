import { runTemplateWorkflow } from '@/runners/templateRunner';
import { workflowManager } from '@/runners/workflowManager.svelte';
import {
	getArticleWithTasksByUrl,
	saveArticle,
	saveDomain,
	saveTasks,
	type ArticleWithTasks,
	type PersistedTaskState,
	type ArticleFieldOverrides
} from '@/stores/webStore';
import { viewState } from '@/stores/viewStore.svelte';
import type { Task } from '@/types/taskRunner.types';
import { invoke } from '@tauri-apps/api/core';
import { compactMarkdown } from '@/lib/utils/splitter';
import { createDefaultTasks } from '@/runners/shared/sharedTasks';
import { getMediaSrc, resolveMediaDirectory } from '@/lib/utils/files';
import { downloadFavicon } from '@/lib/urlRouter/faviconDownloader';
import { EMBEDDING_MODEL } from '@/lib/utils/inference/constants';
import { extractCategoryFromTasks, generateEmbeddingsFromTasks } from '@/lib/utils/embeddingTasks';

type WebRunnerOptions = {
	makeActive?: boolean;
	parentRunId?: string;
	Rebuild?: boolean;
	cachedTasks?: PersistedTaskState[] | null;
	templateId?: string;
	articleOverrides?: ArticleFieldOverrides;
};

function deriveDomainFromUrl(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./i, '');
	} catch {
		return '';
	}
}

async function buildWebInitialTasks(url: string): Promise<Task[]> {
	const response = await invoke<{
		metadata: Record<string, string>;
		markdown: string;
	}>('extract_blog', {
		url,
		selectors: ['body']
	});

	const domainUrl = new URL(url).origin;
	const extraction = {
		metadata: response.metadata,
		content: compactMarkdown(response.markdown)
	};

	const initTask: Task = {
		id: 'init-web',
		name: 'Initialize Web',
		dependencies: [],
		type: 'script',
		run: () => ({ url, domainUrl, language: viewState.language, extraction })
	};

	const extractProfileTask: Task = {
		id: 'extract-web-profile',
		name: 'Extract Web Profile',
		dependencies: ['init-web'],
		type: 'script',
		persist: true,
		run: async (runtime) => {
			const initData = runtime.getTaskData('init-web') as { domainUrl: string; url: string };
			const domainUrl = new URL(initData.domainUrl).hostname.replace(/^www\./i, '');
			const favicon = await downloadFavicon(domainUrl);
			await saveDomain(domainUrl, favicon?.src ?? null, initData.url);
			return {
				profileId: domainUrl,
				profilePicture: favicon?.fileName ?? null
			};
		}
	};

	const metadataTask: Task = {
		id: 'metadata',
		name: 'Metadata',
		dependencies: ['init-web'],
		type: 'script',
		persist: true,
		run: (runtime) => {
			const initData = runtime.getTaskData('init-web') as {
				extraction: { metadata: Record<string, string> };
			};
			return initData.extraction.metadata;
		}
	};

	const thumbnailTask: Task = {
		id: 'thumbnail',
		name: 'Thumbnail',
		dependencies: ['init-web', 'metadata'],
		type: 'script',
		component: 'image',
		persist: true,
		renderOrder: 0.1,
		run: async (runtime) => {
			const initData = runtime.getTaskData('init-web') as { url: string; domainUrl: string };
			const metadata = runtime.getTaskData('metadata') as Record<string, string>;
			const imageUrl = metadata['og:image'] || metadata['twitter:image'];
			const profile =
				metadata.author || metadata['og:site_name'] || metadata['twitter:site'] || null;

			if (!imageUrl) {
				return {
					mediaDirectory: '',
					thumbnailImage: '',
					thumbnailImageSrc: ''
				};
			}

			const resolvedImageUrl = imageUrl.startsWith('/')
				? `${initData.domainUrl}${imageUrl}`
				: imageUrl;

			const mediaDirectory = await resolveMediaDirectory(initData.url, profile);
			const thumbnailImage = await invoke<string>('download_and_save_image', {
				url: resolvedImageUrl,
				folderName: mediaDirectory,
				reductionMagnitud: viewState.thumbnailReductionMagnitud,
				maxDimension: 1024
			});
			const thumbnailImageSrc = await getMediaSrc(thumbnailImage);

			return {
				mediaDirectory,
				thumbnailImage,
				thumbnailImageSrc
			};
		}
	};

	const contentTask: Task = {
		id: 'content',
		name: 'Content',
		dependencies: ['init-web'],
		type: 'script',
		component: 'ask',
		persist: true,
		renderOrder: 999,
		run: (runtime) => {
			const initData = runtime.getTaskData('init-web') as { extraction: { content: string } };
			return initData.extraction.content;
		}
	};

	return [initTask, extractProfileTask, metadataTask, thumbnailTask, contentTask];
}

/**
 * Lightweight pending shells with the same ids/components/renderOrder as the
 * real initial tasks. Hydrated before `extract_blog` resolves so TasksRender
 * paints skeletons instead of staying blank during extraction.
 */
function buildPendingPlaceholderTasks(): Task[] {
	const base: { type: 'script'; status: 'pending'; dependencies: string[]; run: () => null } = {
		type: 'script',
		status: 'pending',
		dependencies: [],
		run: () => null
	};

	return [
		{ ...base, id: 'init-web', name: 'Initialize Web' },
		{
			...base,
			id: 'extract-web-profile',
			name: 'Extract Web Profile',
			dependencies: ['init-web'],
			persist: true
		},
		{ ...base, id: 'metadata', name: 'Metadata', dependencies: ['init-web'], persist: true },
		{
			...base,
			id: 'thumbnail',
			name: 'Thumbnail',
			dependencies: ['init-web', 'metadata'],
			component: 'image',
			persist: true,
			renderOrder: 0.1
		},
		{
			...base,
			id: 'content',
			name: 'Content',
			dependencies: ['init-web'],
			component: 'ask',
			persist: true,
			renderOrder: 999
		}
	];
}

export async function webRunner(url: string, options: WebRunnerOptions = {}): Promise<Task[]> {
	workflowManager.hydrateRun(url, buildPendingPlaceholderTasks(), {
		makeActive: options.makeActive ?? true
	});

	const initialTasks = await buildWebInitialTasks(url);
	const domainUrl = deriveDomainFromUrl(url);

	const result = await runTemplateWorkflow(url, domainUrl, initialTasks, {
		makeActive: options.makeActive ?? true,
		Rebuild: options.Rebuild,
		cachedTasks: options.cachedTasks,
		templateId: options.templateId,
		articleOverrides: options.articleOverrides,
		defaultTasksFactory: () =>
			createDefaultTasks('content', { splitByHeaders: true, embedField: 'summary' }),
		onRunResult: async (runResult, { templateId, articleOverrides }) => {
			const existingArticle: ArticleWithTasks | null = await getArticleWithTasksByUrl(url);
			await Promise.all([
				saveArticle(url, runResult.tasks, { ...articleOverrides, templateId }, existingArticle),
				saveTasks(url, runResult.tasks, existingArticle)
			]);

			if (!viewState.embeddingsEnabled) return;
			const category = extractCategoryFromTasks(runResult.tasks);
			void generateEmbeddingsFromTasks(runResult.tasks, url, {
				model: EMBEDDING_MODEL,
				category
			}).catch((error) => console.error('[webRunner] background embeddings failed', error));
		}
	});

	return result.tasks;
}
