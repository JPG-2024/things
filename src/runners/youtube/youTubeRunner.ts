import { runTemplateWorkflow } from '@/runners/templateRunner';
import { saveArticle, saveProfile, saveTasks, type PersistedTaskState } from '@/stores/webStore';
import { removeYTTimeParam } from '@/lib/utils/youtube/helpers';
import { viewState } from '@/stores/viewStore.svelte';
import type { Task } from '@/types/taskRunner.types';
import { invoke } from '@tauri-apps/api/core';
import { downloadImageUrl, getMediaSrc } from '@/lib/utils/files';
import { getYouTubeThumbnailUrl } from '@/lib/utils/youtube';

export interface YouTubeRunnerOptions {
	profileId?: string;
}

export interface YouTubeRunnerCallConfig {
	options?: YouTubeRunnerOptions;
	cachedTasks?: PersistedTaskState[] | null;
	Rebuild?: boolean;
	makeActive?: boolean;
}

function extractVideoId(url: string): string | null {
	try {
		const urlObj = new URL(url);
		return urlObj.searchParams.get('v');
	} catch {
		return null;
	}
}

function buildYouTubeInitialTasks(cleanUrl: string): Task[] {
	const videoId = extractVideoId(cleanUrl);

	const initTask: Task = {
		id: 'init-youtube',
		name: 'Initialize YouTube',
		dependencies: [],
		type: 'script',
		run: () => ({ url: cleanUrl, videoId, language: viewState.language })
	};

	const thumbnailTask: Task = {
		id: 'thumbnail',
		name: 'Thumbnail',
		dependencies: ['init-youtube'],
		type: 'script',
		component: 'player',
		gridSpan: 3,
		renderOrder: 2,
		persist: true,
		run: async (runtime) => {
			const initData = runtime.getTaskData('init-youtube') as { videoId: string; url: string };
			if (!initData?.videoId) throw new Error('Video ID not found');
			const ytThumbnailUrl = getYouTubeThumbnailUrl(initData.videoId, 'high');
			const { mediaDirectory, fileName: thumbnailImage } = await downloadImageUrl(ytThumbnailUrl);
			const thumbnailImageSrc = await getMediaSrc(thumbnailImage);
			viewState.hoveredPictureSrc = thumbnailImageSrc;
			return {
				mediaDirectory,
				thumbnailImage,
				thumbnailImageSrc,
				videoId: initData.videoId,
				url: initData.url
			};
		}
	};

	const timedCaptionsTask: Task = {
		id: 'timed-captions',
		name: 'Timed Captions',
		dependencies: ['init-youtube'],
		type: 'script',
		run: async (runtime) => {
			const initData = runtime.getTaskData('init-youtube') as { videoId: string; language: string };
			return invoke<unknown[]>('get_youtube_transcript_timed', {
				id: initData.videoId,
				language: initData.language
			});
		}
	};

	const contentTask: Task = {
		id: 'content',
		name: 'Content',
		dependencies: ['timed-captions'],
		type: 'script',
		component: 'ask',
		persist: true,
		renderOrder: 8,
		run: (runtime) => {
			const timedCaptions = runtime.getTaskData('timed-captions') as Array<{ caption: string }>;
			return timedCaptions.map((item) => item.caption).join(' ').trim();
		}
	};

	return [initTask, thumbnailTask, timedCaptionsTask, contentTask];
}

export async function youTubeRunner(
	url: string,
	config?: YouTubeRunnerCallConfig
): Promise<Task[]> {
	const cleanUrl = removeYTTimeParam(url);
	const { options } = config ?? {};

	const profileId = options?.profileId ?? viewState.domainUrl ?? '';
	const initialTasks = buildYouTubeInitialTasks(cleanUrl);

	return runTemplateWorkflow(cleanUrl, profileId, initialTasks, {
		makeActive: config?.makeActive ?? true,
		Rebuild: config?.Rebuild,
		cachedTasks: config?.cachedTasks,
		onRunResult: async (runResult) => {
			const saveOperations: Promise<unknown>[] = [
				saveArticle(cleanUrl, runResult.tasks, { profile: profileId }),
				saveTasks(cleanUrl, runResult.tasks)
			];

			if (profileId) {
				const profilePicture = `https://www.google.com/s2/favicons?sz=64&domain=${profileId}`;
				saveOperations.push(saveProfile(profileId, profilePicture, null, null));
			}

			await Promise.all(saveOperations);
		}
	});
}
