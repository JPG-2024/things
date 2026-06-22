import { z } from 'zod';
import { invoke } from '@tauri-apps/api/core';
import { downloadImageUrl, getMediaSrc } from '@/lib/utils/files';
import { getImageColor } from '@/lib/utils/getImageColor';
import { getYouTubeThumbnailUrl } from '@/lib/utils/youtube';
import { removeYTPpParam } from '@/lib/utils/youtube/helpers';
import { joinCaptionsByChapters } from '@/lib/utils/youtube/joinCaptionsByChapters';
import { parseLastVideoDate } from '@/lib/utils/date';
import { saveProfile, getProfile, assignCategoriesToProfile } from '@/stores/webStore';
import { viewState } from '@/stores/viewStore.svelte';
import { ttsState } from '@/stores/ttsStore.svelte';
import { defineWorkflow, scriptTask, iaTask, getRequiredTaskState } from '@/runners/taskSchema';
import { youTubeRunner } from '../youTubeRunner';
import { profileRunner } from '../profileVideosRunner';
import {
	buildVideoPageParams,
	TaskNames,
	type YouTubeTaskFactoryContext
} from './youtubeTasks.shared';
import { parseStructuredArrayResponses } from '@/lib/utils/helpers/tasks';

export { TaskNames };

const ytCompletionOptions = {
	model: 'llama-server',
	temperature: 0.8,
	min_p: 0.0,
	presence_penalty: 1.5,
	repetition_penalty: 1.0,
	stream: true
} as const;

const structuredOutputOptions = {
	temperature: 0.0,
	top_p: 1.0,
	top_k: 1,
	min_p: 0.0,
	repeat_penalty: 1.0,
	n_predict: 256
} as const;
// Output schemas defined separately so the state type can be derived without circular references
const outputSchemas = {
	[TaskNames.INIT_YOUTUBE_VIDEO]: z.object({
		url: z.string(),
		videoId: z.string().nullable(),
		language: z.string()
	}),
	[TaskNames.INIT_YOUTUBE_PROFILE]: z.object({
		url: z.string(),
		videoId: z.string().nullable(),
		language: z.string(),
		profileId: z.string(),
		videosAmount: z.number().optional()
	}),
	[TaskNames.THUMBNAIL]: z.object({
		mediaDirectory: z.string(),
		thumbnailImage: z.string(),
		thumbnailImageSrc: z.string(),
		videoId: z.string(),
		url: z.string()
	}),
	[TaskNames.MAIN_COLOR]: z.string(),
	[TaskNames.VIDEO_INFO]: z
		.object({
			title: z.string(),
			views: z.string(),
			uploadDate: z.string(),
			profileId: z.string(),
			profilePicture: z.string()
		})
		.passthrough(),
	[TaskNames.PROFILE_FROM_VIDEO]: z.object({
		profileId: z.string()
	}),
	[TaskNames.CHAPTERS]: z.array(z.object({}).passthrough()),
	[TaskNames.TIMED_CAPTIONS]: z.array(z.object({ caption: z.string() }).passthrough()),
	[TaskNames.CONTENT]: z.string(),
	[TaskNames.EXTRACT_PROFILE]: z.object({
		name: z.string(),
		profilePicture: z.string().nullable(),
		videoUrls: z.array(z.string()),
		videosTitles: z.array(z.string()),
		videosImageSrc: z.array(z.string()),
		id: z.string()
	}),
	[TaskNames.EXTRACT_CHANNEL_VIDEOS]: z.object({
		videoUrls: z.array(z.string()),
		results: z.array(z.unknown())
	}),
	[TaskNames.CHAPTERS_SUMMARY]: z.object({
		chapterCaptions: z.array(z.object({}).passthrough())
	}),
	[TaskNames.SUMMARY]: z.string(),
	[TaskNames.TITLE_SUMMARY]: z.string(),
	[TaskNames.TITLE]: z.string(),
	[TaskNames.KEYWORDS]: z.array(z.string()),
	[TaskNames.KEYPOINTS]: z.string(),
	[TaskNames.GENERATE_TTS]: z.string(),
	[TaskNames.CATEGORY]: z.array(z.string()),
	[TaskNames.PROFILE_CATEGORY]: z.array(z.string())
} as const;

type OutputSchemas = typeof outputSchemas;

export type YouTubeTaskState = {
	[K in keyof OutputSchemas]: z.infer<OutputSchemas[K]>;
} & Record<`chapter-summary-${number}`, string>;

function getTaskState<TId extends keyof YouTubeTaskState & string>(
	state: Readonly<Record<string, unknown>>,
	taskId: TId
): YouTubeTaskState[TId] {
	return getRequiredTaskState(state, taskId) as YouTubeTaskState[TId];
}

const getContentFromState = (state: any) => {
	const content = getTaskState(state, TaskNames.CONTENT);

	return content;
};

const youtubeTasks = {
	[TaskNames.INIT_YOUTUBE_VIDEO]: scriptTask({
		name: 'Initialize YouTube Context',
		dependencies: [],
		output: outputSchemas[TaskNames.INIT_YOUTUBE_VIDEO],
		run: ({ context }) => {
			const ctx = context as YouTubeTaskFactoryContext;
			const urlObj = new URL(ctx.url);
			const videoId = urlObj.searchParams.get('v');
			ttsState.videoUrl = ctx.url;
			return { url: ctx.url, videoId, language: ctx.language };
		}
	}),
	[TaskNames.INIT_YOUTUBE_PROFILE]: scriptTask({
		name: 'Initialize YouTube Profile',
		dependencies: [],
		output: outputSchemas[TaskNames.INIT_YOUTUBE_PROFILE],
		run: ({ context }) => {
			const ctx = context as YouTubeTaskFactoryContext;
			const urlObj = new URL(ctx.url);
			const profileId = (ctx.profileId || urlObj.pathname.split('/')[1]).toLowerCase();
			const url = `https://www.youtube.com/${profileId}/videos`;
			return { ...ctx, url, profileId, videosAmount: ctx.videosAmount };
		}
	}),
	[TaskNames.THUMBNAIL]: scriptTask({
		dependencies: [TaskNames.INIT_YOUTUBE_VIDEO],
		component: 'player',
		gridSpan: 3,
		persist: true,
		output: outputSchemas[TaskNames.THUMBNAIL],
		run: async ({ state }) => {
			const urlData = getTaskState(state, TaskNames.INIT_YOUTUBE_VIDEO);
			if (!urlData.videoId) throw new Error('Video ID not found in URL');
			const ytThumbnailUrl = getYouTubeThumbnailUrl(urlData.videoId, 'high');
			const { mediaDirectory, fileName: thumbnailImage } = await downloadImageUrl(ytThumbnailUrl);
			const thumbnailImageSrc = await getMediaSrc(thumbnailImage);

			viewState.hoveredPictureSrc = thumbnailImageSrc;

			return {
				mediaDirectory,
				thumbnailImage,
				thumbnailImageSrc,
				videoId: urlData.videoId,
				url: urlData.url
			};
		}
	}),
	[TaskNames.MAIN_COLOR]: scriptTask({
		name: 'Get main color',
		dependencies: [TaskNames.THUMBNAIL],
		output: outputSchemas[TaskNames.MAIN_COLOR],
		run: async ({ state }) => {
			const thumbnail = getTaskState(state, TaskNames.THUMBNAIL);
			let mainColor = '';
			try {
				mainColor = await getImageColor(thumbnail.thumbnailImageSrc || '');
				if (mainColor) viewState.primaryColor = mainColor;
			} catch (colorError) {
				console.error('Error extracting main color:', colorError);
			}
			return mainColor;
		}
	}),
	[TaskNames.VIDEO_INFO]: scriptTask({
		dependencies: [TaskNames.INIT_YOUTUBE_VIDEO],
		component: 'videoInfo',
		persist: true,
		output: outputSchemas[TaskNames.VIDEO_INFO],
		run: async ({ state }) => {
			const context = getTaskState(state, TaskNames.INIT_YOUTUBE_VIDEO);
			const videoInfo = await invoke<Record<string, string>>('get_page_elements', {
				...buildVideoPageParams(context.url),
				selectors: [
					{ name: 'title', selector: '#title h1 yt-formatted-string' },
					{ name: 'views', selector: 'span.view-count' },
					{ name: 'uploadDate', selector: 'div#info-strings yt-formatted-string' },
					{ name: 'profileId', selector: 'div#upload-info a', attribute: 'href' },
					{ name: 'profilePicture', selector: '#img ', attribute: 'src' }
				],
				attempts: 5,
				intervalMs: 200
			});

			videoInfo.profileId = videoInfo.profileId.slice(1).toLowerCase();

			return videoInfo;
		}
	}),
	[TaskNames.PROFILE_FROM_VIDEO]: scriptTask({
		name: 'Extract profile from video',
		dependencies: [TaskNames.VIDEO_INFO, TaskNames.GENERATE_TTS],
		persist: true,
		output: outputSchemas[TaskNames.PROFILE_FROM_VIDEO],
		run: async ({ state }) => {
			const { profileId } = getTaskState(state, TaskNames.VIDEO_INFO);

			if (!profileId) throw new Error('No profileId found in video info');
			const existingProfile = await getProfile(profileId);
			if (existingProfile) return { profileId };
			const profileUrl = `https://www.youtube.com/${profileId}/videos`;
			await profileRunner(profileUrl, {
				runnerConfig: { routine: 'fromVideo', makeActive: false },
				options: { videosAmount: 1, profileId }
			});
			return { profileId };
		}
	}),
	[TaskNames.CHAPTERS]: scriptTask({
		dependencies: [TaskNames.INIT_YOUTUBE_VIDEO],
		output: outputSchemas[TaskNames.CHAPTERS],
		run: async ({ state }) => {
			const context = getTaskState(state, TaskNames.INIT_YOUTUBE_VIDEO);
			return invoke<unknown[]>('extract_chapters', buildVideoPageParams(context.url));
		}
	}),
	[TaskNames.TIMED_CAPTIONS]: scriptTask({
		name: 'Get timed captions',
		dependencies: [TaskNames.INIT_YOUTUBE_VIDEO],
		output: outputSchemas[TaskNames.TIMED_CAPTIONS],
		run: async ({ state }) => {
			const context = getTaskState(state, TaskNames.INIT_YOUTUBE_VIDEO);
			return invoke<unknown[]>('get_youtube_transcript_timed', {
				id: context.videoId,
				language: context.language
			});
		}
	}),
	[TaskNames.CONTENT]: scriptTask({
		dependencies: [TaskNames.TIMED_CAPTIONS],
		component: 'ask',
		persist: true,
		output: outputSchemas[TaskNames.CONTENT],
		run: ({ state }) => {
			const timedCaptions = getTaskState(state, TaskNames.TIMED_CAPTIONS);
			return timedCaptions
				.map((item: { caption: string }) => item.caption)
				.join(' ')
				.trim();
		}
	}),
	[TaskNames.EXTRACT_PROFILE]: scriptTask({
		dependencies: [TaskNames.INIT_YOUTUBE_PROFILE],
		component: 'profile',
		gridSpan: 3,
		persist: true,
		output: outputSchemas[TaskNames.EXTRACT_PROFILE],
		run: async ({ state, context }) => {
			console.log('CONTEXT', context);
			const initCtx = getTaskState(state, TaskNames.INIT_YOUTUBE_PROFILE);
			const result = await invoke<Record<string, unknown>>('get_page_elements', {
				url: initCtx.url,
				selectors: [
					{ name: 'profile', selector: 'yt-content-metadata-view-model' },
					{ name: 'channelName', selector: 'h1 > span' },
					{
						name: 'profilePicture',
						selector: 'div#page-header-container img[src]',
						attribute: 'src'
					},
					{ name: 'videoIds', selector: 'a.ytLockupViewModelContentImage', attribute: 'href' },
					{
						name: 'uploadDate',
						selector: 'div.ytLockupMetadataViewModelMetadata span:nth-of-type(3)'
					},
					{
						name: 'videosImageSrc',
						selector: 'yt-thumbnail-view-model img',
						attribute: 'src'
					},
					{ name: 'videosTitles', selector: 'a.ytLockupMetadataViewModelTitle span' }
				],
				attempts: 5,
				intervalMs: 500,
				scrollTimes: context.scrollTimes ?? 2
			});

			const profilePictureRaw = result.profilePicture;
			const pictureUrl = Array.isArray(profilePictureRaw)
				? profilePictureRaw[1]
				: profilePictureRaw;

			const downloadedImage = pictureUrl ? await downloadImageUrl(pictureUrl as string) : null;
			const profilePictureSrc = downloadedImage
				? await getMediaSrc(downloadedImage.fileName)
				: null;
			if (!result.videoIds) throw new Error('No video IDs found in profile page scrape');
			const videoIds = result.videoIds as string[];
			const videoUrls = videoIds.map((id: string) => `https://www.youtube.com${id}`);
			const uploadDates = (result.uploadDate as string[] | undefined) ?? [];
			const lastVideoDate =
				uploadDates.map((d) => parseLastVideoDate(d)).find((d) => d !== '1970-01-01') ??
				'1970-01-01';
			const profileId = (
				(result.profile as string[] | undefined)?.[0] ?? initCtx.profileId
			).toLowerCase();
			const channelName = result.channelName as string;
			const profile = {
				id: profileId,
				name: channelName,
				profilePicture: profilePictureSrc,
				videoUrls,
				videosImageSrc: result.videosImageSrc as string[],
				videosTitles: result.videosTitles as string[]
			};

			ttsState.namePrefix = profile.id;
			ttsState.imageSrc = profile.profilePicture ?? '';
			ttsState.videoUrl = profile.videoUrls[0] ?? '';

			await saveProfile(
				initCtx.profileId,
				downloadedImage?.fileName ?? null,
				lastVideoDate,
				initCtx.url
			);

			return profile;
		}
	}),
	[TaskNames.EXTRACT_CHANNEL_VIDEOS]: scriptTask({
		name: 'Extract channel videos',
		dependencies: [TaskNames.EXTRACT_PROFILE],
		output: outputSchemas[TaskNames.EXTRACT_CHANNEL_VIDEOS],
		run: async ({ runId, state }) => {
			const profileData = getTaskState(state, TaskNames.EXTRACT_PROFILE);
			const initCtx = getTaskState(state, TaskNames.INIT_YOUTUBE_PROFILE);
			const videosAmount = initCtx.videosAmount ?? 4;
			const profileId = initCtx.profileId;
			const urlsToProcess = profileData.videoUrls.slice(0, videosAmount).reverse();
			const cleanedUrls = urlsToProcess.map((url) => removeYTPpParam(url));
			const results = [];
			for (const url of cleanedUrls) {
				const row = await invoke('get_web_store_article_by_url', { url });
				if (row) continue;
				results.push(
					await youTubeRunner(url, {
						runnerConfig: {
							makeActive: true,
							parentRunId: runId,
							routine: 'fromProfileRunner'
						},
						options: { profileId }
					})
				);
			}
			return { videoUrls: profileData.videoUrls, results };
		}
	}),
	[TaskNames.CHAPTERS_SUMMARY]: scriptTask({
		dependencies: [TaskNames.INIT_YOUTUBE_VIDEO, TaskNames.CHAPTERS, TaskNames.TIMED_CAPTIONS],
		persist: true,
		output: outputSchemas[TaskNames.CHAPTERS_SUMMARY],
		run: async ({ state, enqueueTasks }) => {
			const context = getTaskState(state, TaskNames.INIT_YOUTUBE_VIDEO);
			const chapters = getTaskState(state, TaskNames.CHAPTERS);
			const timedCaptions = getTaskState(state, TaskNames.TIMED_CAPTIONS);
			if (!chapters.length) return { chapterCaptions: [] };
			const chapterCaptions = joinCaptionsByChapters(
				timedCaptions as Parameters<typeof joinCaptionsByChapters>[0],
				chapters as Parameters<typeof joinCaptionsByChapters>[1]
			);
			const chapterSummaryTasks = buildChapterSummaryTasks(
				chapterCaptions,
				context.language as string
			);
			enqueueTasks(chapterSummaryTasks);
			return { chapterCaptions };
		}
	}),
	[TaskNames.SUMMARY]: iaTask({
		name: 'Summary',
		dependencies: [TaskNames.CONTENT],
		component: 'taskBase',
		componentProps: ({ context }) => {
			const ctx = context as YouTubeTaskFactoryContext;
			return { autoplayTTS: ctx.freshRun };
		},
		output: outputSchemas[TaskNames.SUMMARY],
		systemMessage: ({ context }) => {
			const ctx = context as YouTubeTaskFactoryContext;
			return `Focus on extracting: ... Answer in ${ctx.language === 'es' ? 'Spanish' : 'English'}.`;
		},
		userMessage: ({ context }) => {
			const ctx = context as YouTubeTaskFactoryContext;
			return `Summarize the context clearly in a single paragraph. no more than 80 words. Answer in ${ctx.language === 'es' ? 'Spanish' : 'English'}.`;
		},
		run: getContentFromState,
		completionOptions: ytCompletionOptions
	}),
	[TaskNames.TITLE_SUMMARY]: iaTask({
		name: 'Title Summary',
		dependencies: [TaskNames.CONTENT],
		component: 'taskBase',
		output: outputSchemas[TaskNames.TITLE_SUMMARY],
		systemMessage: `You are a reviewer of content.`,
		userMessage: ({ context }) => {
			const ctx = context as YouTubeTaskFactoryContext;
			return `Write a summary in 2 paragraphs. No markdown. No enumertions. no titles. Just a precize analisis. Answer in ${ctx.language === 'es' ? 'Spanish' : 'English'}.`;
		},
		run: ({ state }) => {
			const content = getTaskState(state, TaskNames.CONTENT);
			return content;
		},
		completionOptions: ytCompletionOptions
	}),
	[TaskNames.GENERATE_TTS]: scriptTask({
		name: 'Generate TTS',
		dependencies: [TaskNames.TITLE_SUMMARY],
		output: outputSchemas[TaskNames.GENERATE_TTS],
		run: async ({ state, context }) => {
			const summary = getTaskState(state, TaskNames.TITLE_SUMMARY);
			const ctx = context as YouTubeTaskFactoryContext;

			if (ctx.freshRun) {
				ttsState.setTextContents([summary]);
				await ttsState.generateTTS(ctx.url);
			}
		}
	}),
	[TaskNames.TITLE]: iaTask({
		name: 'Title',
		dependencies: [TaskNames.TITLE_SUMMARY],
		component: 'taskBase',
		gridSpan: 1,
		output: outputSchemas[TaskNames.TITLE],
		systemMessage: 'Avoid Markdown',
		userMessage: ({ context }) => {
			const ctx = context as YouTubeTaskFactoryContext;
			return `Generate a short title for this context that describes the main idea in 10 words. Answer in ${ctx.language === 'es' ? 'Spanish' : 'English'}.`;
		},
		run: ({ state }) => {
			const titleSummary = state[TaskNames.TITLE_SUMMARY];
			if (typeof titleSummary !== 'string') throw new Error('TITLE_SUMMARY is missing or invalid');
			return titleSummary;
		},
		completionOptions: ytCompletionOptions
	}),
	[TaskNames.KEYWORDS]: iaTask({
		dependencies: [TaskNames.CONTENT],
		component: 'keywords',
		output: outputSchemas[TaskNames.KEYWORDS],
		systemMessage: 'Return only valid JSON that matches the provided schema.',
		userMessage: 'extract 5 keywords.',
		run: ({ state }) => {
			const content = state[TaskNames.CONTENT];
			if (typeof content !== 'string') throw new Error('CONTENT is missing or invalid');
			return content;
		},
		resultParser: (text) => {
			const categories = parseStructuredArrayResponses(text);
			return categories;
		},
		completionOptions: {
			...structuredOutputOptions,
			response_format: {
				type: 'json_schema',
				json_schema: {
					name: 'keywords',
					strict: true,
					schema: {
						type: 'object',
						properties: {
							keywords: {
								type: 'array',
								items: { type: 'string' },
								minItems: 5,
								maxItems: 5
							}
						},
						required: ['keywords'],
						additionalProperties: false
					}
				}
			}
		}
	}),
	[TaskNames.CATEGORY]: iaTask({
		dependencies: [TaskNames.KEYWORDS],
		component: 'keywords',
		output: outputSchemas[TaskNames.CATEGORY],
		systemMessage: 'Return only valid JSON that matches the provided schema.',
		userMessage: `Give a category from this ones: ${viewState.categories}`,
		run: ({ state }) => {
			const keywords = state[TaskNames.KEYWORDS];
			return keywords.join(' ');
		},
		resultParser: (text) => {
			const categories = parseStructuredArrayResponses(text);
			return categories;
		},
		completionOptions: {
			...structuredOutputOptions,
			response_format: {
				type: 'json_schema',
				json_schema: {
					name: 'category',
					strict: true,
					schema: {
						type: 'object',
						properties: {
							category: {
								type: 'string',
								enum: viewState.categories.map((c) => c.name)
							}
						},
						required: ['category'],
						additionalProperties: false
					}
				}
			}
		}
	}),
	[TaskNames.PROFILE_CATEGORY]: iaTask({
		dependencies: [TaskNames.EXTRACT_PROFILE],
		component: 'keywords',
		output: outputSchemas[TaskNames.PROFILE_CATEGORY],
		systemMessage: 'Return only valid JSON that matches the provided schema.',
		userMessage: () => {
			const categoryNames = viewState.categories.map((c) => c.name).join(', ');
			return `Give a category from this ones: ${categoryNames || 'health, psychology, programming'}.`;
		},
		run: ({ state }) => {
			const profile = state[TaskNames.EXTRACT_PROFILE];
			const videosTitles = profile.videosTitles;
			return videosTitles.join(' ');
		},
		resultParser: (text) => {
			const categories = parseStructuredArrayResponses(text);
			return categories;
		},
		onComplete: async ({ state, result }) => {
			const profile = state[TaskNames.EXTRACT_PROFILE];
			const categoryNames = result as string[];
			const categoryIds = categoryNames
				.map((name) => viewState.categories.find((c) => c.name === name)?.id)
				.filter((id): id is string => id !== undefined);

			if (categoryIds.length > 0) {
				await assignCategoriesToProfile({
					profileId: profile.id,
					categoryIds
				});
			}
		},
		completionOptions: () => ({
			...ytCompletionOptions,
			temperature: 1.0,
			response_format: {
				type: 'json_schema',
				json_schema: {
					name: 'category',
					strict: true,
					schema: {
						type: 'object',
						properties: {
							category: {
								type: 'string',
								enum: viewState.categories.map((c) => c.name)
							}
						},
						required: ['category'],
						additionalProperties: false
					}
				}
			}
		})
	}),
	[TaskNames.KEYPOINTS]: iaTask({
		name: 'Key points',
		dependencies: [TaskNames.CONTENT],
		component: 'listItems',
		output: outputSchemas[TaskNames.KEYPOINTS],
		systemMessage: ({ context }) => {
			const ctx = context as YouTubeTaskFactoryContext;
			return `Return only valid JSON that matches the provided schema. Response in language: ${ctx.language === 'es' ? 'Spanish' : 'English'}.`;
		},
		userMessage: 'extract 8 keypoints. Each keypoint should be a short, clear statement.',
		run: ({ state }) => {
			const content = state[TaskNames.CONTENT];
			if (typeof content !== 'string') throw new Error('CONTENT is missing or invalid');
			return content;
		},
		completionOptions: {
			...structuredOutputOptions,
			response_format: {
				type: 'json_schema',
				json_schema: {
					name: 'keypoints',
					strict: true,
					schema: {
						type: 'object',
						properties: {
							keypoints: {
								type: 'array',
								items: { type: 'string' },
								minItems: 8,
								maxItems: 8
							}
						},
						required: ['keypoints'],
						additionalProperties: false
					}
				}
			}
		}
	})
};

export const youtubeWorkflow = defineWorkflow({ tasks: youtubeTasks });

function buildChapterSummaryTasks(
	chapterCaptions: Array<{ title: string; content: string }>,
	language: string
) {
	return chapterCaptions.map((chapter, index) => ({
		id: `chapter-summary-${index}`,
		name: chapter.title,
		widget: false,
		type: 'ia' as const,
		component: 'taskBase',
		dependencies: index === 0 ? [TaskNames.CHAPTERS_SUMMARY] : [`chapter-summary-${index - 1}`],
		systemMessage: `You are a helpful assistant that summarizes YouTube video chapters. Answer in ${language === 'es' ? 'Spanish' : 'English'}.`,
		run: () => `Title: ${chapter.title}\n\n${chapter.content}`,
		userMessage:
			'Summarize this chapter in 2 lines. add a relevant emoji at the beginning of the summary.',
		completionOptions: ytCompletionOptions
	}));
}

export const youtubeTaskRegistry = youtubeWorkflow.registry;
