import { z } from 'zod';
import { invoke } from '@tauri-apps/api/core';
import { compactMarkdown } from '@/lib/utils/splitter';
import { getMediaSrc, resolveMediaDirectory } from '@/lib/utils/files';
import { ttsState } from '@/stores/ttsStore.svelte';
import { viewState } from '@/stores/viewStore.svelte';
import { saveProfile } from '@/stores/webStore';
import { downloadFavicon } from '@/lib/urlRouter/faviconDownloader';
import {
	defineWorkflow,
	scriptTask,
	iaTask,
	getRequiredTaskState,
	createContentGetter
} from '@/runners/taskSchema';
import { WebTaskNames, type WebTaskFactoryContext } from './webTasks.shared';
import { DEFAULT_WEB_COMPLETION_OPTIONS } from '@/lib/utils/inference/constants';
import { createTitleTask, createSummaryTask } from '@/runners/shared/dynamicTasks';
import { SHARED_TASK_IDS, sharedOutputSchemas } from '@/runners/shared/sharedTasks';

export { WebTaskNames };

const outputSchemas = {
	[WebTaskNames.INIT_WEB_CONTEXT]: z.object({
		url: z.string(),
		domainUrl: z.string(),
		language: z.string(),
		extraction: z.object({
			metadata: z.record(z.string(), z.string()),
			content: z.string()
		})
	}),
	[WebTaskNames.EXTRACT_WEB_PROFILE]: z.object({
		profileId: z.string(),
		profilePicture: z.string().nullable()
	}),
	[WebTaskNames.METADATA]: z.record(z.string(), z.string()),
	[WebTaskNames.THUMBNAIL]: z.object({
		mediaDirectory: z.string(),
		thumbnailImage: z.string(),
		thumbnailImageSrc: z.string()
	}),
	[WebTaskNames.TITLE]: sharedOutputSchemas[SHARED_TASK_IDS.TITLE],
	[WebTaskNames.CONTENT]: z.string(),
	[WebTaskNames.TITLE_SUMMARY]: z.string(),
	[WebTaskNames.KEYWORDS]: z.string(),
	[WebTaskNames.KEYPOINTS]: z.string(),
	[WebTaskNames.GENERATE_TTS]: z.string()
} as const;

type OutputSchemas = typeof outputSchemas;

export type WebTaskState = {
	[K in keyof OutputSchemas]: z.infer<OutputSchemas[K]>;
};

function getTaskState<TId extends keyof WebTaskState & string>(
	state: Readonly<Record<string, unknown>>,
	taskId: TId
): WebTaskState[TId] {
	return getRequiredTaskState(state, taskId) as WebTaskState[TId];
}

const getContentFromState = createContentGetter(WebTaskNames.CONTENT);

export const webWorkflow = defineWorkflow({
	tasks: {
		[WebTaskNames.INIT_WEB_CONTEXT]: scriptTask({
			name: 'Initialize web context',
			dependencies: [],
			output: outputSchemas[WebTaskNames.INIT_WEB_CONTEXT],
			run: async ({ context }) => {
				const ctx = context as WebTaskFactoryContext;
				const response = await invoke<{
					metadata: Record<string, string>;
					markdown: string;
				}>('extract_blog', {
					url: ctx.url,
					selectors: ['body']
				});

				console.log(response.metadata, 'Extracted metadata:', response.metadata);

				return {
					url: ctx.url,
					domainUrl: new URL(ctx.url).origin,
					language: ctx.language,
					extraction: {
						metadata: response.metadata,
						content: compactMarkdown(response.markdown)
					}
				};
			}
		}),

		[WebTaskNames.EXTRACT_WEB_PROFILE]: scriptTask({
			name: 'Extract web profile',
			dependencies: [WebTaskNames.INIT_WEB_CONTEXT],
			persist: true,
			output: outputSchemas[WebTaskNames.EXTRACT_WEB_PROFILE],
			run: async ({ state }) => {
				const init = getTaskState(state, WebTaskNames.INIT_WEB_CONTEXT);
				const domainUrl = new URL(init.domainUrl).hostname;
				const favicon = await downloadFavicon(domainUrl);

				await saveProfile(domainUrl, favicon?.src ?? null, null, init.url);

				return {
					profileId: domainUrl,
					profilePicture: favicon?.fileName ?? null
				};
			}
		}),

		[WebTaskNames.METADATA]: scriptTask({
			name: 'Extract metadata',
			dependencies: [WebTaskNames.INIT_WEB_CONTEXT],
			persist: true,
			output: outputSchemas[WebTaskNames.METADATA],
			run: ({ state }) => {
				const init = getTaskState(state, WebTaskNames.INIT_WEB_CONTEXT);
				return init.extraction.metadata;
			}
		}),

		[WebTaskNames.THUMBNAIL]: scriptTask({
			dependencies: [
				WebTaskNames.INIT_WEB_CONTEXT,
				WebTaskNames.METADATA,
				WebTaskNames.EXTRACT_WEB_PROFILE
			],
			component: 'image',
			persist: true,
			output: outputSchemas[WebTaskNames.THUMBNAIL],
			run: async ({ state }) => {
				const init = getTaskState(state, WebTaskNames.INIT_WEB_CONTEXT);
				const metadata = getTaskState(state, WebTaskNames.METADATA);
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
					? `${init.domainUrl}${imageUrl}`
					: imageUrl;

				const mediaDirectory = await resolveMediaDirectory(init.url, profile);
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
		}),

		[WebTaskNames.TITLE]: createTitleTask({ persist: true }),

		[WebTaskNames.CONTENT]: scriptTask({
			dependencies: [WebTaskNames.INIT_WEB_CONTEXT],
			component: 'ask',
			persist: true,
			output: outputSchemas[WebTaskNames.CONTENT],
			run: ({ state }) => {
				const init = getTaskState(state, WebTaskNames.INIT_WEB_CONTEXT);
				return init.extraction.content;
			}
		}),

		[WebTaskNames.TITLE_SUMMARY]: createSummaryTask({
			componentProps: ({ context }) => {
				const ctx = context as WebTaskFactoryContext;
				return { autoplayTTS: ctx.freshRun };
			},
			systemMessage:
				'You are a professional article summarizer. Write a concise and clear summary. Keep the response under 80 words.',
			userMessage: 'Summarize the article context in one paragraph.',
			onComplete: ({ result, context }) => {
				if (viewState.autoSpeechEnabled) {
					ttsState.setTextContents([result as string]);
					ttsState.generateTTS((context as WebTaskFactoryContext).url);
				}
			},
			completionOptions: DEFAULT_WEB_COMPLETION_OPTIONS
		}),

		[WebTaskNames.KEYWORDS]: iaTask({
			dependencies: [WebTaskNames.CONTENT],
			component: 'keywords',
			output: outputSchemas[WebTaskNames.KEYWORDS],
			systemMessage: ({ context }) => {
				const ctx = context as WebTaskFactoryContext;
				return `Return only valid JSON that matches the provided schema. The keywords must be in ${ctx.language === 'es' ? 'Spanish' : 'English'}.`;
			},
			userMessage: 'Extract 5 representative keywords from the article.',
			run: getContentFromState,
			completionOptions: {
				...DEFAULT_WEB_COMPLETION_OPTIONS,
				temperature: 0,
				top_p: 1,
				top_k: 0,
				min_p: 0,
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

		[WebTaskNames.KEYPOINTS]: iaTask({
			dependencies: [WebTaskNames.CONTENT],
			component: 'listItems',
			output: outputSchemas[WebTaskNames.KEYPOINTS],
			systemMessage: ({ context }) => {
				const ctx = context as WebTaskFactoryContext;
				return `Return only valid JSON that matches the provided schema. Keep all key points in ${ctx.language === 'es' ? 'Spanish' : 'English'}.`;
			},
			userMessage: 'Extract 5 insights in one line each.',
			run: getContentFromState,
			completionOptions: {
				...DEFAULT_WEB_COMPLETION_OPTIONS,
				temperature: 0.9,
				response_format: {
					type: 'json_schema',
					json_schema: {
						name: 'keypointsTitles',
						strict: true,
						schema: {
							type: 'object',
							properties: {
								keypointsTitles: {
									type: 'array',
									items: { type: 'string' },
									minItems: 5,
									maxItems: 5
								}
							},
							required: ['keypointsTitles'],
							additionalProperties: false
						}
					}
				}
			}
		}),

		[WebTaskNames.GENERATE_TTS]: scriptTask({
			name: 'Generate TTS',
			dependencies: [WebTaskNames.TITLE_SUMMARY],
			output: outputSchemas[WebTaskNames.GENERATE_TTS],
			run: async ({ state, context }) => {
				const summary = getTaskState(state, WebTaskNames.TITLE_SUMMARY);
				const ctx = context as WebTaskFactoryContext;

				if (ctx.freshRun) {
					ttsState.setTextContents([summary]);
					await ttsState.generateTTS(ctx.url);
				}

				return summary;
			}
		})
	}
});

export const webTaskRegistry = webWorkflow.registry;
