import { z } from 'zod';
import { invoke } from '@tauri-apps/api/core';
import { compactMarkdown } from '@/lib/utils/splitter';
import { getMediaSrc, resolveMediaDirectory } from '@/lib/utils/files';
import { ttsState } from '@/stores/ttsStore.svelte';
import {
	defineWorkflow,
	scriptTask,
	iaTask,
	getRequiredTaskState,
	createContentGetter
} from '@/runners/taskSchema';
import {
	defaultCompletionOptions,
	WebTaskNames,
	type WebTaskFactoryContext
} from './webTasks.shared';

export { WebTaskNames };

const outputSchemas = {
	[WebTaskNames.INIT_WEB_CONTEXT]: z.object({
		url: z.string(),
		language: z.string(),
		extraction: z.object({
			metadata: z.record(z.string(), z.string()),
			content: z.string()
		})
	}),
	[WebTaskNames.METADATA]: z.record(z.string(), z.string()),
	[WebTaskNames.THUMBNAIL]: z.object({
		mediaDirectory: z.string(),
		thumbnailImage: z.string(),
		thumbnailImageSrc: z.string()
	}),
	[WebTaskNames.TITLE]: z.string(),
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

				return {
					url: ctx.url,
					language: ctx.language,
					extraction: {
						metadata: response.metadata,
						content: compactMarkdown(response.markdown)
					}
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
			dependencies: [WebTaskNames.INIT_WEB_CONTEXT, WebTaskNames.METADATA],
			component: 'image',
			persist: true,
			output: outputSchemas[WebTaskNames.THUMBNAIL],
			run: async ({ state, context }) => {
				const ctx = context as WebTaskFactoryContext;
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

				const mediaDirectory = await resolveMediaDirectory(init.url, profile);
				const thumbnailImage = await invoke<string>('download_and_save_image', {
					url: imageUrl,
					folderName: mediaDirectory,
					reductionMagnitud: 2
				});
				const thumbnailImageSrc = await getMediaSrc(thumbnailImage);

				return {
					mediaDirectory,
					thumbnailImage,
					thumbnailImageSrc
				};
			}
		}),

		[WebTaskNames.TITLE]: scriptTask({
			name: 'Extract title',
			dependencies: [WebTaskNames.METADATA],
			component: 'taskBase',
			persist: true,
			output: outputSchemas[WebTaskNames.TITLE],
			run: ({ state }) => {
				const metadata = getTaskState(state, WebTaskNames.METADATA);
				const possibleTitle =
					metadata['og:title'] || metadata['twitter:title'] || metadata.title || '';

				return possibleTitle.trim();
			}
		}),

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

		[WebTaskNames.TITLE_SUMMARY]: iaTask({
			dependencies: [WebTaskNames.CONTENT],
			component: 'taskBase',
			componentProps: ({ context }) => {
				const ctx = context as WebTaskFactoryContext;
				return { autoplayTTS: ctx.freshRun };
			},
			output: outputSchemas[WebTaskNames.TITLE_SUMMARY],
			systemMessage:
				'You are a professional article summarizer. Write a concise and clear summary. Keep the response under 80 words.',
			userMessage: ({ context }) => {
				const ctx = context as WebTaskFactoryContext;
				return `Summarize the article context in one paragraph. Answer in ${ctx.language === 'es' ? 'Spanish' : 'English'}`;
			},
			run: ({ state }) => {
				const content = getTaskState(state, WebTaskNames.CONTENT);
				return content;
			},
			completionOptions: defaultCompletionOptions
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
				...defaultCompletionOptions,
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
				...defaultCompletionOptions,
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
			}
		})
	}
});

export const webTaskRegistry = webWorkflow.registry;
