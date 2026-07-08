import { z } from 'zod';
import { defineWorkflow, scriptTask, iaTask, getRequiredTaskState } from '@/runners/taskSchema';
import { ttsState } from '@/stores/ttsStore.svelte';
import { TaskNames, type TaskFactoryContext, defaultCompletionOptions } from './rawTasks.shared';
import { sharedTasks, sharedOutputSchemas, SHARED_TASK_IDS } from '@/runners/shared/sharedTasks';

export { TaskNames };

const outputSchemas = {
	[TaskNames.INIT_RAW_CONTEXT]: z.object({
		rawText: z.string(),
		language: z.string()
	}),
	[TaskNames.TITLE]: sharedOutputSchemas[SHARED_TASK_IDS.TITLE],
	[TaskNames.CONTENT]: z.string(),
	[TaskNames.TITLE_SUMMARY]: z.string(),
	[TaskNames.KEYWORDS]: sharedOutputSchemas[SHARED_TASK_IDS.KEYWORDS],
	[TaskNames.EMOJIS]: sharedOutputSchemas[SHARED_TASK_IDS.EMOJIS],
	[TaskNames.CATEGORY]: sharedOutputSchemas[SHARED_TASK_IDS.CATEGORY],
	[TaskNames.GENERATE_TTS]: z.string()
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
		...sharedTasks,

		[TaskNames.INIT_RAW_CONTEXT]: scriptTask({
			name: 'Initialize raw context',
			dependencies: [],
			output: outputSchemas[TaskNames.INIT_RAW_CONTEXT],
			run: async ({ context }) => {
				const ctx = context as TaskFactoryContext;
				return {
					rawText: ctx.rawText,
					language: ctx.language
				};
			}
		}),

		[TaskNames.CONTENT]: scriptTask({
			dependencies: [TaskNames.INIT_RAW_CONTEXT],
			component: 'ask',
			persist: true,
			output: outputSchemas[TaskNames.CONTENT],
			run: ({ state }) => {
				const init = getTaskState(state, TaskNames.INIT_RAW_CONTEXT);
				return init.rawText;
			}
		}),

		[TaskNames.TITLE_SUMMARY]: iaTask({
			dependencies: [TaskNames.CONTENT],
			component: 'taskBase',
			output: outputSchemas[TaskNames.TITLE_SUMMARY],
			systemMessage:
				'You are a professional text summarizer. Write a concise and clear summary. Keep the response under 80 words.',
			userMessage: ({ context }) => {
				const ctx = context as TaskFactoryContext;
				return `Summarize the following text in one paragraph. Answer in ${ctx.language === 'es' ? 'Spanish' : 'English'}.`;
			},
			run: async ({ state }) => {
				const content = getTaskState(state, TaskNames.CONTENT);
				return content;
			},
			onComplete: ({ result, context }) => {
				const ctx = context as TaskFactoryContext;
				ttsState.setTextContents([result as string]);
				ttsState.generateTTS(ctx.rawId);
			},
			completionOptions: defaultCompletionOptions
		}),

		[TaskNames.GENERATE_TTS]: scriptTask({
			name: 'Generate TTS',
			dependencies: [TaskNames.TITLE_SUMMARY],
			output: outputSchemas[TaskNames.GENERATE_TTS],
			run: async ({ state, context }) => {
				const summary = getTaskState(state, TaskNames.TITLE_SUMMARY);
				const ctx = context as TaskFactoryContext;

				if (ctx.freshRun) {
					ttsState.setTextContents([summary]);
					await ttsState.generateTTS(ctx.rawId);
				}

				return summary;
			}
		})
	}
});

export const rawTaskRegistry = rawWorkflow.registry;
