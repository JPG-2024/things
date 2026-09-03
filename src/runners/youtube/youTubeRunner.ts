import { runTemplateWorkflow } from '@/runners/templateRunner';
import {
	saveArticle,
	saveProfile,
	saveTasks,
	getArticleWithTasksByUrl,
	getProfile,
	type PersistedTaskState
} from '@/stores/webStore';
import { viewState } from '@/stores/viewStore.svelte';
import { scrapStore } from '@/stores/scrapStore.svelte';
import { createDefaultTasks } from '@/runners/shared/sharedTasks';
import type { Task } from '@/types/taskRunner.types';
import { invoke } from '@tauri-apps/api/core';
import { downloadImageUrl, getMediaSrc } from '@/lib/utils/files';
import { getYouTubeThumbnailUrl } from '@/lib/utils/youtube';
import { buildYouTubeProfileUrl } from '@/lib/utils/youtube/helpers';
import { EMBEDDING_MODEL } from '@/lib/utils/inference/constants';
import { extractCategoryFromTasks, generateEmbeddingsFromTasks } from '@/lib/utils/embeddingTasks';

export interface YouTubeRunnerCallConfig {
	cachedTasks?: PersistedTaskState[] | null;
	Rebuild?: boolean;
	makeActive?: boolean;
	skipTaskIds?: string[];
	profileId?: string;
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

	const profileTask: Task = {
		id: 'profile',
		name: 'Profile',
		dependencies: ['init-youtube'],
		type: 'script',
		persist: true,
		run: async (runtime) => {
			const initData = runtime.getTaskData('init-youtube') as { videoId: string; url: string };
			if (!initData?.videoId) return null;

			const existingArticle = await getArticleWithTasksByUrl(initData.url);
			if (existingArticle?.profileId) {
				const existingProfile = await getProfile(existingArticle.profileId);
				if (existingProfile) {
					const picture = existingProfile.profilePicture ?? '';
					let localImage = '';
					if (picture) {
						if (picture.includes('://')) {
							try {
								localImage = (await downloadImageUrl(picture)).fileName;
							} catch (e) {
								console.warn('Failed to localize profile image', e);
							}
						} else {
							localImage = picture;
						}
					}
					let profilePath = `channel/${existingProfile.id}`;
					if (existingProfile.url) {
						try {
							profilePath = new URL(existingProfile.url).pathname.replace(/^\//, '');
						} catch {
							/* keep default */
						}
					}
					scrapStore.currentYoutubeProfile = {
						id: existingProfile.id,
						profilePath,
						videos: [],
						profileImage: localImage
					};
				}
				return null;
			}

			const youtubeProfile = await scrapStore.getProfileInfoFromVideo(initData.videoId);
			if (!youtubeProfile) return null;
			let profileImageLocal: string | null = null;
			if (youtubeProfile.profileImage) {
				try {
					const { fileName } = await downloadImageUrl(youtubeProfile.profileImage);
					profileImageLocal = fileName;
				} catch (e) {
					console.warn('Failed to download YouTube profile image', e);
				}
			}
			scrapStore.currentYoutubeProfile = {
				...youtubeProfile,
				profileImage: profileImageLocal ?? ''
			};
			return {
				id: youtubeProfile.id,
				profilePath: youtubeProfile.profilePath,
				profileImage: youtubeProfile.profileImage,
				profileImageLocal,
				profileUrl: buildYouTubeProfileUrl(youtubeProfile.profilePath || youtubeProfile.id)
			};
		}
	};

	const thumbnailTask: Task = {
		id: 'thumbnail',
		name: 'Thumbnail',
		dependencies: ['init-youtube'],
		type: 'script',
		component: 'player',
		gridSpan: 1,
		renderOrder: 1,
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
		renderOrder: 999,
		run: (runtime) => {
			const timedCaptions = runtime.getTaskData('timed-captions') as Array<{ caption: string }>;
			return timedCaptions
				.map((item) => item.caption)
				.join(' ')
				.trim();
		}
	};

	return [initTask, profileTask, thumbnailTask, timedCaptionsTask, contentTask];
}

export async function youTubeRunner(
	url: string,
	config?: YouTubeRunnerCallConfig
): Promise<Task[]> {
	const cleanUrl = url;
	const initialTasks = buildYouTubeInitialTasks(cleanUrl);
	const domainUrl = viewState.domainUrl ?? '';
	const normalizedRunnerProfileId = config?.profileId?.trim()
		? config.profileId.trim().toLowerCase().replace(/\s+/g, '-')
		: undefined;
	scrapStore.currentYoutubeProfile = null;

	return runTemplateWorkflow(cleanUrl, domainUrl, initialTasks, {
		makeActive: config?.makeActive ?? true,
		Rebuild: config?.Rebuild,
		cachedTasks: config?.cachedTasks,
		skipTaskIds: config?.skipTaskIds,
		defaultTasksFactory: () => createDefaultTasks('content'),
		onRunResult: async (runResult) => {
			const profileData = runResult.tasks.find((t) => t.id === 'profile')?.data as
				| {
						id: string;
						profilePath: string;
						profileImage: string;
						profileImageLocal: string | null;
						profileUrl: string;
				  }
				| undefined;

			const profileIdForArticle = profileData?.id ?? normalizedRunnerProfileId;
			const saveOperations: Promise<unknown>[] = [
				saveArticle(
					cleanUrl,
					runResult.tasks,
					profileIdForArticle ? { profile: profileIdForArticle } : undefined
				),
				saveTasks(cleanUrl, runResult.tasks)
			];

			if (profileData?.id) {
				saveOperations.push(
					saveProfile(
						profileData.id,
						profileData.profileImageLocal ?? profileData.profileImage,
						profileData.profileUrl,
						'youtube.com'
					)
				);
			}

			await Promise.all(saveOperations);

			if (viewState.embeddingsEnabled) {
				await generateEmbeddingsFromTasks(runResult.tasks, cleanUrl, {
					model: EMBEDDING_MODEL,
					category: extractCategoryFromTasks(runResult.tasks)
				});
			}
		}
	});
}
