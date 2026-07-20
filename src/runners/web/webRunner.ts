import { runTemplateWorkflow } from '@/runners/templateRunner';
import { saveArticle, saveProfile, saveTasks, type PersistedTaskState } from '@/stores/webStore';
import { viewState } from '@/stores/viewStore.svelte';
import type { Task } from '@/types/taskRunner.types';
import { invoke } from '@tauri-apps/api/core';
import { compactMarkdown } from '@/lib/utils/splitter';
import { getMediaSrc, resolveMediaDirectory } from '@/lib/utils/files';
import { downloadFavicon } from '@/lib/urlRouter/faviconDownloader';

type WebRunnerOptions = {
	makeActive?: boolean;
	parentRunId?: string;
	Rebuild?: boolean;
	cachedTasks?: PersistedTaskState[] | null;
};

function deriveDomainFromUrl(url: string): string {
	try {
		return new URL(url).hostname;
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
			const domainUrl = new URL(initData.domainUrl).hostname;
			const favicon = await downloadFavicon(domainUrl);
			await saveProfile(domainUrl, favicon?.src ?? null, null, initData.url);
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
		dependencies: ['init-web', 'metadata', 'extract-web-profile'],
		type: 'script',
		component: 'image',
		persist: true,
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
				reductionMagnitud: 2
			});
			const thumbnailImageSrc = await getMediaSrc(thumbnailImage);

			viewState.hoveredPictureSrc = thumbnailImageSrc;

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
		run: (runtime) => {
			const initData = runtime.getTaskData('init-web') as { extraction: { content: string } };
			return initData.extraction.content;
		}
	};

	return [initTask, extractProfileTask, metadataTask, thumbnailTask, contentTask];
}

export async function webRunner(url: string, options: WebRunnerOptions = {}): Promise<Task[]> {
	const initialTasks = await buildWebInitialTasks(url);
	const domainUrl = deriveDomainFromUrl(url);

	return runTemplateWorkflow(url, domainUrl, initialTasks, {
		makeActive: options.makeActive ?? true,
		Rebuild: options.Rebuild,
		cachedTasks: options.cachedTasks,
		onRunResult: async (runResult) => {
			const profileTask = runResult.tasks.find((task) => task.id === 'extract-web-profile');
			const profileTaskData = profileTask?.data as { profileId?: string } | undefined;
			const extractedProfileId =
				typeof profileTaskData?.profileId === 'string' && profileTaskData.profileId.length > 0
					? profileTaskData.profileId
					: null;
			const effectiveProfile = extractedProfileId ?? viewState.domainUrl;

			const saveOperations: Promise<unknown>[] = [
				saveArticle(url, runResult.tasks, { profile: effectiveProfile ?? '' }),
				saveTasks(url, runResult.tasks)
			];

			if (effectiveProfile) {
				const profilePicture = `https://www.google.com/s2/favicons?sz=64&domain=${effectiveProfile}`;
				saveOperations.push(saveProfile(effectiveProfile, profilePicture, null, null));
			}

			await Promise.all(saveOperations);
		}
	});
}
