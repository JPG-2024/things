import { z } from 'zod';
import { invoke } from '@tauri-apps/api/core';
import { downloadImageUrl, getMediaSrc } from '@/lib/utils/files';
import { getImageColor } from '@/lib/utils/getImageColor';
import { getYouTubeThumbnailUrl } from '@/lib/utils/youtube';
import { viewState } from '@/stores/viewStore.svelte';
import { ttsState } from '@/stores/ttsStore.svelte';
import { defineWorkflow, scriptTask, iaTask, getRequiredTaskState } from '@/runners/taskSchema';
import { TaskNames, type YouTubeTaskFactoryContext } from './youtubeTasks.shared';
import { DEFAULT_COMPLETION_OPTIONS } from '@/lib/utils/llama-completions';
import { sharedTasks } from '@/runners/shared/sharedTasks';

export { TaskNames };

const structuredOutputOptions = {
	temperature: 0,
	top_p: 0.9,
	top_k: 1,
	presence_penalty: 0,
	stream: false
} as const;

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
	[TaskNames.TIMED_CAPTIONS]: z.array(z.object({ caption: z.string() }).passthrough()),
	[TaskNames.CONTENT]: z.string(),
	[TaskNames.SUMMARY]: z.string(),
	[TaskNames.TITLE_SUMMARY]: z.string(),
	[TaskNames.TITLE]: z.string(),
	[TaskNames.KEYWORDS]: z.array(z.string()),
	[TaskNames.KEYPOINTS]: z.string(),
	[TaskNames.GENERATE_TTS]: z.string(),
	[TaskNames.CATEGORY]: z.array(z.string())
} as const;

type OutputSchemas = typeof outputSchemas;

export type YouTubeTaskState = {
	[K in keyof OutputSchemas]: z.infer<OutputSchemas[K]>;
};

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
	...sharedTasks,

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
		completionOptions: DEFAULT_COMPLETION_OPTIONS
	}),
	[TaskNames.TITLE_SUMMARY]: iaTask({
		name: 'Title summary',
		dependencies: [TaskNames.CONTENT],
		component: 'taskBase',
		output: outputSchemas[TaskNames.TITLE_SUMMARY],
		systemMessage: `You are a reviewer of content.`,
		persist: true,
		userMessage: ({ context }) => {
			const ctx = context as YouTubeTaskFactoryContext;
			return `Write a summary in 2 paragraphs. No markdown. No enumertions. no titles. Just a precize analisis. Answer in ${ctx.language === 'es' ? 'Spanish' : 'English'}.`;
		},
		run: ({ state }) => {
			const content = getTaskState(state, TaskNames.CONTENT);
			return content;
		},
		onComplete: ({ result, context }) => {
			if (viewState.autoSpeechEnabled) {
				ttsState.setTextContents([result as string]);
				ttsState.generateTTS((context as YouTubeTaskFactoryContext).url);
			}
		},
		completionOptions: DEFAULT_COMPLETION_OPTIONS
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

			return summary;
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
			return `Create a short title describing the content. Answer in ${ctx.language === 'es' ? 'Spanish' : 'English'}.`;
		},
		run: ({ state }) => {
			const titleSummary = state[TaskNames.TITLE_SUMMARY];
			if (typeof titleSummary !== 'string') throw new Error('TITLE_SUMMARY is missing or invalid');
			return titleSummary;
		},
		completionOptions: DEFAULT_COMPLETION_OPTIONS
	}),
	[TaskNames.KEYPOINTS]: iaTask({
		name: 'Key points',
		dependencies: [TaskNames.CONTENT],
		component: 'listItems',
		output: outputSchemas[TaskNames.KEYPOINTS],
		systemMessage: ({ context }) => {
			const ctx = context as YouTubeTaskFactoryContext;
			return `You are a data extraction assistant. You must return only valid JSON matching the provided schema. Do not include markdown formatting, conversational text, or numbered lists.`;
		},
		userMessage: 'Extract 5 keywords from the text in Spanish.',
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

export const youtubeTaskRegistry = youtubeWorkflow.registry;
