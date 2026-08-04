import { z } from 'zod';
import { iaTask } from '@/runners/taskSchema';
import type { IaTaskDef } from '@/runners/taskSchema';
import { parseStructuredArrayResponses } from '@/lib/utils/helpers/tasks';
import {
	SUMMARY_COMPLETION_OPTIONS,
	DEFAULT_IA_COMPLETION_OPTIONS,
	DEFAULT_TITLE_COMPLETION_OPTIONS
} from '@/lib/utils/inference/constants';
import {
	buildExtractionCompletionOptions,
	buildExtractionSystemMessage,
	buildExtractionUserMessage
} from '@/lib/utils/inference/extraction-helper';
import type { IaTaskSubtype, Task } from '@/types/taskRunner.types';

const DEFAULT_DYNAMIC_MODEL = 'llama-server';
const DEFAULT_IA_SYSTEM_MESSAGE =
	'You are a helpful AI assistant. Respond concisely and accurately.';

export interface DefineTaskOptions {
	name?: string;
	dependencies?: string[];
	subtype?: IaTaskSubtype;
	systemMessage?:
		| string
		| ((ctx: { context: unknown; state: Readonly<Record<string, unknown>> }) => string);
	userMessage?:
		| string
		| ((ctx: { context: unknown; state: Readonly<Record<string, unknown>> }) => string);
	component?: string;
	model?: string;
	renderOrder?: number;
	completionOptions?:
		| Record<string, unknown>
		| ((ctx: {
				context: unknown;
				state: Readonly<Record<string, unknown>>;
		  }) => Record<string, unknown>);
	persist?: boolean;
	enableTTS?: boolean;
	gridSpan?: 1 | 2 | 3;
	componentProps?:
		| Record<string, unknown>
		| ((ctx: {
				context: unknown;
				state: Readonly<Record<string, unknown>>;
		  }) => Record<string, unknown>);
	extractorConfig?: { count: number; description: string };
}

export function defineTask(options: DefineTaskOptions): IaTaskDef {
	const extractor = options.extractorConfig;

	if (extractor) {
		const deps = options.dependencies ?? ['content'];
		const sourceDependency = deps[0] ?? 'content';
		const model = options.model ?? DEFAULT_DYNAMIC_MODEL;

		return iaTask({
			name: options.name,
			dependencies: deps,
			subtype: 'extraction',
			component: options.component ?? 'keywords',
			renderOrder: options.renderOrder,
			output: z.array(z.string()),
			systemMessage:
				options.systemMessage ??
				buildExtractionSystemMessage(extractor.count, extractor.description),
			userMessage:
				options.userMessage ??
				buildExtractionUserMessage(extractor.count, extractor.description),
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
			completionOptions:
				options.completionOptions ?? buildExtractionCompletionOptions(extractor.count, model),
			extractorConfig: extractor,
			...(options.persist != null && { persist: options.persist }),
			...(options.enableTTS != null && { enableTTS: options.enableTTS }),
			...(options.gridSpan != null && { gridSpan: options.gridSpan }),
			...(options.componentProps != null && { componentProps: options.componentProps })
		});
	}

	return iaTask({
		name: options.name,
		dependencies: options.dependencies ?? [],
		subtype: options.subtype,
		component: options.component ?? 'taskBase',
		output: z.string(),
		systemMessage: options.systemMessage ?? DEFAULT_IA_SYSTEM_MESSAGE,
		userMessage: options.userMessage ?? '',
		renderOrder: options.renderOrder,
		completionOptions: options.completionOptions ?? {
			...DEFAULT_IA_COMPLETION_OPTIONS,
			model: options.model ?? DEFAULT_DYNAMIC_MODEL
		},
		...(options.persist != null && { persist: options.persist }),
		...(options.enableTTS != null && { enableTTS: options.enableTTS }),
		...(options.gridSpan != null && { gridSpan: options.gridSpan }),
		...(options.componentProps != null && { componentProps: options.componentProps })
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
	}) => string = () => {
		return `Create a title of one sentence. start with an emoji.`;
	};

	return {
		name: 'Title',
		dependencies: ['title-summary'],
		subtype: 'title' as const,
		component: 'taskBase',
		output: z.string(),
		renderOrder: 1,
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

export interface CreateSummaryTaskOptions {
	name?: string;
	dependencies?: string[];
	systemMessage?: string;
	userMessage?: string;
	componentProps?:
		| Record<string, unknown>
		| ((ctx: {
				context: unknown;
				state: Readonly<Record<string, unknown>>;
		  }) => Record<string, unknown>);
	onComplete?: (params: {
		result: unknown;
		runResult: string;
		context: unknown;
		state: Readonly<Record<string, unknown>>;
	}) => void | Promise<void>;
	completionOptions?:
		| Record<string, unknown>
		| ((ctx: {
				context: unknown;
				state: Readonly<Record<string, unknown>>;
		  }) => Record<string, unknown>);
	persist?: boolean;
}

export function createSummaryTask(options?: CreateSummaryTaskOptions): IaTaskDef<z.ZodString> {
	const deps = options?.dependencies ?? ['content'];

	return iaTask({
		...(options?.name != null && { name: options.name }),
		dependencies: deps,
		component: 'taskBase',
		output: z.string(),
		systemMessage:
			options?.systemMessage ??
			'You are a professional content summarizer. Write a concise and clear summary.',
		userMessage: options?.userMessage ?? 'Summarize the content.',
		run: ({ state }) => {
			const depKey = deps[0];
			const content = state[depKey];
			if (typeof content !== 'string')
				throw new Error(`Missing content from dependency "${depKey}"`);
			return content;
		},
		...(options?.componentProps != null && { componentProps: options.componentProps }),
		...(options?.onComplete != null && { onComplete: options.onComplete }),
		completionOptions: options?.completionOptions ?? SUMMARY_COMPLETION_OPTIONS,
		...(options?.persist != null && { persist: options.persist })
	});
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
		...(def.renderOrder != null && { renderOrder: def.renderOrder }),
		...(def.gridSpan != null && { gridSpan: def.gridSpan }),
		...(def.persist != null && { persist: def.persist }),
		...(def.componentProps != null && { componentProps: def.componentProps }),
		...(def.enableTTS != null && { enableTTS: def.enableTTS }),
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
