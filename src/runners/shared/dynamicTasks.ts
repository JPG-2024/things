import { z } from 'zod';
import { iaTask } from '@/runners/taskSchema';
import type { IaTaskDef } from '@/runners/taskSchema';
import { parseStructuredArrayResponses } from '@/lib/utils/helpers/tasks';
import { stringArrayGbnf } from '@/lib/utils/gbnf';
import type { IaTaskSubtype, Task } from '@/types/taskRunner.types';

const DEFAULT_DYNAMIC_MODEL = 'llama-server';

const DEFAULT_IA_SYSTEM_MESSAGE =
	'You are a helpful AI assistant. Respond concisely and accurately.';

export const SUMMARY_COMPLETION_OPTIONS = {
	temperature: 0.2,
	top_k: 40,
	min_p: 0.05,
	presence_penalty: 0,
	n_predict: 1500,
	stream: false
} as const;

export const structuredOutputOptions = {
	temperature: 0.1,
	top_k: 40,
	min_p: 0.1,
	presence_penalty: 0,
	n_predict: 256,
	stream: false
} as const;

const DEFAULT_IA_COMPLETION_OPTIONS = {
	temperature: 0.7,
	top_p: 0.8,
	top_k: 20,
	min_p: 0.0,
	presence_penalty: 1.5,
	repetition_penalty: 1.0,
	stream: false
} as const;

const DEFAULT_TITLE_COMPLETION_OPTIONS = {
	temperature: 0.7,
	top_p: 0.9,
	max_tokens: 20,
	frequency_penalty: 0.4,
	presence_penalty: 0.1,
	stop: ['\n', '. ', '? ', '! '],
	seed: 42
} as const;

export interface CreateIaTaskOptions {
	id?: string;
	name?: string;
	dependencies?: string[];
	subtype?: IaTaskSubtype;
	systemMessage?:
		| string
		| ((ctx: { context: unknown; state: Readonly<Record<string, unknown>> }) => string);
	userMessage:
		| string
		| ((ctx: { context: unknown; state: Readonly<Record<string, unknown>> }) => string);
	component?: string;
	model?: string;
	completionOptions?:
		| Record<string, unknown>
		| ((ctx: {
				context: unknown;
				state: Readonly<Record<string, unknown>>;
		  }) => Record<string, unknown>);
}

export function createIaTask(options: CreateIaTaskOptions): IaTaskDef<z.ZodString> {
	const {
		name,
		dependencies = [],
		subtype,
		systemMessage,
		userMessage,
		component = 'taskBase',
		model = DEFAULT_DYNAMIC_MODEL,
		completionOptions
	} = options;

	return iaTask({
		name,
		dependencies,
		subtype,
		component,
		output: z.string(),
		systemMessage: systemMessage ?? DEFAULT_IA_SYSTEM_MESSAGE,
		userMessage,
		completionOptions: completionOptions ?? {
			...DEFAULT_IA_COMPLETION_OPTIONS,
			model
		}
	});
}

export interface CreateExtractorTaskOptions {
	id?: string;
	name?: string;
	count: number;
	description: string;
	component?: string;
	dependencies?: string[];
	model?: string;
}

export function createExtractorTask(
	options: CreateExtractorTaskOptions
): IaTaskDef<z.ZodArray<z.ZodString>> {
	const {
		count,
		description,
		component = 'keywords',
		dependencies = ['content'],
		name,
		model = DEFAULT_DYNAMIC_MODEL
	} = options;

	const sourceDependency = dependencies[0] ?? 'content';

	return iaTask({
		name,
		dependencies,
		subtype: 'extraction',
		component,
		output: z.array(z.string()),
		systemMessage: `You are a data extraction assistant. Return only a JSON array of exactly ${count} ${description}. No markdown, no explanations.`,
		userMessage: `Extract ${count} ${description}. Respond in JSON format.`,
		run: ({ state, taskId }) => {
			const content = state[sourceDependency];
			if (typeof content !== 'string') {
				throw new Error(
					`Task "${taskId}" missing string content from dependency "${sourceDependency}".`
				);
			}
			return content;
		},
		resultParser: (text) => parseStructuredArrayResponses(text),
		completionOptions: {
			...structuredOutputOptions,
			model,
			grammar: stringArrayGbnf(count)
		},
		extractorConfig: { count, description }
	});
}

interface CreateTitleTaskOptions {
	systemMessage?:
		| string
		| ((ctx: { context: unknown; state: Readonly<Record<string, unknown>> }) => string);
	userMessage?:
		| string
		| ((ctx: { context: unknown; state: Readonly<Record<string, unknown>> }) => string);
	completionOptions?: Record<string, unknown>;
	persist?: boolean;
	gridSpan?: 1 | 2 | 3;
}

export function createTitleTaskConfig(options?: CreateTitleTaskOptions) {
	const defaultUserMessage: (ctx: {
		context: unknown;
		state: Readonly<Record<string, unknown>>;
	}) => string = ({ context }) => {
		const lang = (context as { language?: string })?.language;
		return `Create a short title describing the content. No more than 10 words. Start with an emoji. Answer in ${lang === 'es' ? 'Spanish' : 'English'}.`;
	};

	return {
		name: 'Title',
		dependencies: ['title-summary'],
		subtype: 'title' as const,
		component: 'taskBase',
		output: z.string(),
		systemMessage: options?.systemMessage ?? 'Avoid Markdown.',
		userMessage: options?.userMessage ?? defaultUserMessage,
		run: ({ state }: { state: Record<string, unknown> }) => {
			const titleSummary = state['title-summary'];
			if (typeof titleSummary !== 'string') throw new Error('TITLE_SUMMARY is missing or invalid');
			return titleSummary;
		},
		completionOptions: options?.completionOptions ?? DEFAULT_TITLE_COMPLETION_OPTIONS,
		persist: options?.persist,
		gridSpan: options?.gridSpan
	};
}

export function createTitleTask(options?: CreateTitleTaskOptions) {
	return iaTask(createTitleTaskConfig(options));
}

export function buildTask(def: IaTaskDef, id: string): Task {
	const propsCtx = { context: undefined, state: {} as Record<string, unknown> };

	const systemMessage =
		typeof def.systemMessage === 'function' ? def.systemMessage(propsCtx) : def.systemMessage;
	const userMessage =
		typeof def.userMessage === 'function' ? def.userMessage(propsCtx) : def.userMessage;
	const completionOptions =
		typeof def.completionOptions === 'function'
			? def.completionOptions(propsCtx)
			: def.completionOptions;

	return {
		id,
		name: def.name,
		dependencies: def.dependencies ?? [],
		type: 'ia' as const,
		subtype: def.subtype,
		systemMessage,
		userMessage,
		completionOptions: completionOptions as Task['completionOptions'],
		component: def.component,
		...(def.extractorConfig != null && { extractorConfig: def.extractorConfig }),
		...(def.run != null && {
			run: async (runtime: Parameters<NonNullable<IaTaskDef['run']>>[0]) =>
				def.run!({
					runId: runtime.runId,
					taskId: runtime.taskId,
					state: runtime.state,
					context: undefined,
					update: runtime.update,
					enqueueTasks: runtime.enqueueTasks as (
						tasks: Task[],
						options?: { restart?: boolean }
					) => void
				})
		}),
		...(def.resultParser != null && {
			resultParser: async (text: string, ctx: { state: Record<string, unknown> }) =>
				def.resultParser!(text, { ...ctx, context: undefined })
		}),
		...(def.onComplete != null && {
			onComplete: async (params: {
				result: unknown;
				runResult: string;
				state: Record<string, unknown>;
			}) => def.onComplete!({ ...params, context: undefined })
		})
	} as Task;
}
