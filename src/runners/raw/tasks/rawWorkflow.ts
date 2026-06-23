import { z } from 'zod';
import { defineWorkflow, scriptTask, iaTask, getRequiredTaskState } from '@/runners/taskSchema';
import { ttsState } from '@/stores/ttsStore.svelte';
import {
	RawTaskNames,
	type RawTaskFactoryContext,
	defaultCompletionOptions
} from './rawTasks.shared';

export { RawTaskNames };

const outputSchemas = {
	[RawTaskNames.INIT_RAW_CONTEXT]: z.object({
		rawText: z.string(),
		language: z.string()
	}),
	[RawTaskNames.TITLE]: z.string(),
	[RawTaskNames.CONTENT]: z.string(),
	[RawTaskNames.TITLE_SUMMARY]: z.string(),
	[RawTaskNames.GENERATE_TTS]: z.string()
} as const;

type OutputSchemas = typeof outputSchemas;

export type RawTaskState = {
	[K in keyof OutputSchemas]: z.infer<OutputSchemas[K]>;
};

function getTaskState<TId extends keyof RawTaskState & string>(
	state: Readonly<Record<string, unknown>>,
	taskId: TId
): RawTaskState[TId] {
	return getRequiredTaskState(state, taskId) as RawTaskState[TId];
}

export const rawWorkflow = defineWorkflow({
	tasks: {
		[RawTaskNames.INIT_RAW_CONTEXT]: scriptTask({
			name: 'Initialize raw context',
			dependencies: [],
			output: outputSchemas[RawTaskNames.INIT_RAW_CONTEXT],
			run: async ({ context }) => {
				const ctx = context as RawTaskFactoryContext;
				return {
					rawText: ctx.rawText,
					language: ctx.language
				};
			}
		}),

		[RawTaskNames.CONTENT]: scriptTask({
			dependencies: [RawTaskNames.INIT_RAW_CONTEXT],
			component: 'ask',
			persist: true,
			output: outputSchemas[RawTaskNames.CONTENT],
			run: ({ state }) => {
				const init = getTaskState(state, RawTaskNames.INIT_RAW_CONTEXT);
				return init.rawText;
			}
		}),

		[RawTaskNames.TITLE]: iaTask({
			dependencies: [RawTaskNames.TITLE_SUMMARY],
			component: 'taskBase',
			output: outputSchemas[RawTaskNames.TITLE],
			systemMessage: ({ context }) => {
				const ctx = context as RawTaskFactoryContext;
				return `Generate a concise title for the following text. Answer in ${ctx.language === 'es' ? 'Spanish' : 'English'}. Return only the title, nothing else.`;
			},
			userMessage: 'Generate a title for this text.',
			run: async ({ state }) => {
				const content = getTaskState(state, RawTaskNames.TITLE_SUMMARY);
				return content;
			},
			completionOptions: defaultCompletionOptions
		}),

		[RawTaskNames.TITLE_SUMMARY]: iaTask({
			dependencies: [RawTaskNames.CONTENT],
			component: 'taskBase',
			output: outputSchemas[RawTaskNames.TITLE_SUMMARY],
			systemMessage:
				'You are a professional text summarizer. Write a concise and clear summary. Keep the response under 80 words.',
			userMessage: ({ context }) => {
				const ctx = context as RawTaskFactoryContext;
				return `Summarize the following text in one paragraph. Answer in ${ctx.language === 'es' ? 'Spanish' : 'English'}.`;
			},
			run: async ({ state }) => {
				const content = getTaskState(state, RawTaskNames.CONTENT);
				return content;
			},
			completionOptions: defaultCompletionOptions
		}),

		[RawTaskNames.GENERATE_TTS]: scriptTask({
			name: 'Generate TTS',
			dependencies: [RawTaskNames.TITLE_SUMMARY],
			output: outputSchemas[RawTaskNames.GENERATE_TTS],
			run: async ({ state, context }) => {
				const summary = getTaskState(state, RawTaskNames.TITLE_SUMMARY);
				const ctx = context as RawTaskFactoryContext;

				if (ctx.freshRun) {
					ttsState.setTextContents([summary]);
					await ttsState.generateTTS(ctx.rawId);
				}
			}
		})
	}
});

export const rawTaskRegistry = rawWorkflow.registry;
