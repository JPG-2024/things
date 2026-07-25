import { z } from 'zod';
import { buildIaTask, iaTask } from '@/runners/taskSchema';
import type { IaTaskDef, TaskRunContext } from '@/runners/taskSchema';
import { parseStructuredArrayResponses } from '@/lib/utils/helpers/tasks';
import { arrayToGbnf, stringArrayGbnf } from '@/lib/utils/gbnf';
import {
	DEFAULT_IA_COMPLETION_OPTIONS,
	DEFAULT_STRUCTURED_OUTPUT_OPTIONS,
	DEFAULT_TITLE_COMPLETION_OPTIONS,
	SUMMARY_COMPLETION_OPTIONS
} from '@/lib/utils/inference/constants';
import { viewState } from '@/stores/viewStore.svelte';
import type { IaTaskSubtype, Task } from '@/types/taskRunner.types';

const DEFAULT_DYNAMIC_MODEL = 'llama-server';
const DEFAULT_IA_SYSTEM_MESSAGE =
	'You are a helpful AI assistant. Respond concisely and accurately.';

type FactoryCtx = { context: unknown; state: Readonly<Record<string, unknown>> };
type MaybeFn<T> = T | ((ctx: FactoryCtx) => T);

export type IaTaskFactoryOptions<TParsed = string> = {
	name?: string;
	dependencies?: string[];
	subtype?: IaTaskSubtype;
	component?: string;
	componentProps?: MaybeFn<Record<string, unknown>>;
	gridSpan?: 1 | 2 | 3;
	renderOrder?: number;
	persist?: boolean;
	enableTTS?: boolean;
	baseUrl?: string;
	extractorConfig?: { count: number; description: string };
	systemMessage?: MaybeFn<string>;
	userMessage?: MaybeFn<string>;
	completionOptions?: MaybeFn<Record<string, unknown>>;
	model?: string;
	run?: (ctx: TaskRunContext<unknown, Record<string, unknown>>) => string | Promise<string>;
	resultParser?: (text: string, ctx: FactoryCtx) => TParsed | Promise<TParsed>;
	onComplete?: (params: {
		result: unknown;
		runResult: string;
		context: unknown;
		state: Readonly<Record<string, unknown>>;
	}) => void | Promise<void>;
};

function stripUndefined<T extends object>(obj: T): T {
	return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined)) as T;
}

export function createIaTask<
	TOutput extends z.core.$ZodType = z.ZodString,
	TParsed = z.infer<TOutput>
>(
	options: IaTaskFactoryOptions<TParsed> & { output?: TOutput } = {}
): IaTaskDef<TOutput, unknown, TParsed> {
	const { model, completionOptions, output, ...rest } = stripUndefined(options);

	return iaTask({
		component: 'taskBase',
		systemMessage: DEFAULT_IA_SYSTEM_MESSAGE,
		userMessage: '',
		...rest,
		output: (output ?? z.string()) as TOutput,
		completionOptions: completionOptions ?? {
			...DEFAULT_IA_COMPLETION_OPTIONS,
			model: model ?? DEFAULT_DYNAMIC_MODEL
		}
	});
}

export type ExtractionTaskOptions = Omit<
	IaTaskFactoryOptions<string[]>,
	'subtype' | 'run' | 'resultParser'
> & {
	extractor: { count: number; description: string };
};

export function createExtractionTask(
	options: ExtractionTaskOptions
): IaTaskDef<z.ZodArray<z.ZodString>, unknown, string[]> {
	const {
		extractor,
		dependencies = ['content'],
		systemMessage,
		userMessage,
		completionOptions,
		model,
		...rest
	} = stripUndefined(options);
	const sourceDependency = dependencies[0];

	return createIaTask({
		component: 'keywords',
		...rest,
		dependencies,
		subtype: 'extraction',
		extractorConfig: extractor,
		output: z.array(z.string()),
		systemMessage:
			systemMessage ??
			`You are a data extraction assistant. Return only a JSON array of exactly ${extractor.count} ${extractor.description}. No markdown, no explanations.`,
		userMessage:
			userMessage ?? `Extract ${extractor.count} ${extractor.description}. Respond in JSON format.`,
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
		completionOptions: completionOptions ?? {
			...DEFAULT_STRUCTURED_OUTPUT_OPTIONS,
			model: model ?? DEFAULT_DYNAMIC_MODEL,
			grammar: stringArrayGbnf(extractor.count)
		}
	});
}

export type CreateTitleTaskOptions = {
	dependencies?: string[];
	systemMessage?: MaybeFn<string>;
	userMessage?: MaybeFn<string>;
	completionOptions?: Record<string, unknown>;
	persist?: boolean;
	gridSpan?: 1 | 2 | 3;
	renderOrder?: number;
};

export function createTitleTask(options?: CreateTitleTaskOptions): IaTaskDef<z.ZodString> {
	const dependencies = options?.dependencies ?? ['title-summary'];
	const sourceDependency = dependencies[0];

	const defaultUserMessage = ({ context }: FactoryCtx) => {
		const lang = (context as { language?: string })?.language;
		return `Create a short title describing the content. No more than 10 words. Start with an emoji. Answer in ${lang === 'es' ? 'Spanish' : 'English'}.`;
	};

	return createIaTask({
		name: 'Title',
		dependencies,
		subtype: 'title',
		renderOrder: options?.renderOrder ?? 1,
		systemMessage: options?.systemMessage ?? 'Avoid Markdown.',
		userMessage: options?.userMessage ?? defaultUserMessage,
		run: ({ state }) => {
			const source = state[sourceDependency];
			if (typeof source !== 'string') throw new Error(`${sourceDependency} is missing or invalid`);
			return source;
		},
		completionOptions: options?.completionOptions ?? DEFAULT_TITLE_COMPLETION_OPTIONS,
		persist: options?.persist,
		gridSpan: options?.gridSpan
	});
}

export type CreateSummaryTaskOptions = {
	name?: string;
	dependencies?: string[];
	systemMessage?: string;
	userMessage?: string;
	componentProps?: MaybeFn<Record<string, unknown>>;
	onComplete?: (params: {
		result: unknown;
		runResult: string;
		context: unknown;
		state: Readonly<Record<string, unknown>>;
	}) => void | Promise<void>;
	completionOptions?: MaybeFn<Record<string, unknown>>;
	persist?: boolean;
	renderOrder?: number;
};

export function createSummaryTask(options?: CreateSummaryTaskOptions): IaTaskDef<z.ZodString> {
	const dependencies = options?.dependencies ?? ['content'];
	const sourceDependency = dependencies[0];

	return createIaTask({
		name: options?.name,
		dependencies,
		systemMessage:
			options?.systemMessage ??
			'You are a professional content summarizer. Write a concise and clear summary.',
		userMessage: options?.userMessage ?? 'Summarize the content.',
		run: ({ state }) => {
			const content = state[sourceDependency];
			if (typeof content !== 'string')
				throw new Error(`Missing content from dependency "${sourceDependency}"`);
			return content;
		},
		componentProps: options?.componentProps,
		onComplete: options?.onComplete,
		completionOptions: options?.completionOptions ?? SUMMARY_COMPLETION_OPTIONS,
		persist: options?.persist,
		renderOrder: options?.renderOrder
	});
}

export type CreateCategoryTaskOptions = {
	keywordsDependency?: string;
	persist?: boolean;
	renderOrder?: number;
};

export function createCategoryTask(
	options?: CreateCategoryTaskOptions
): IaTaskDef<z.ZodArray<z.ZodString>, unknown, string[]> {
	const keywordsDependency = options?.keywordsDependency ?? 'keywords';

	return createIaTask({
		dependencies: [keywordsDependency],
		component: 'keywords',
		componentProps: { showPoint: false },
		persist: options?.persist,
		renderOrder: options?.renderOrder,
		output: z.array(z.string()),
		systemMessage:
			'You are a data extraction assistant. Return only a JSON array with a single category name. No markdown, no explanations.',
		userMessage: () => {
			const categoryNames = viewState.categories.map((c) => c.name).join(', ');
			return `Give a category from this ones: ${categoryNames}.`;
		},
		run: ({ state }) => {
			const keywords = state[keywordsDependency] as string[];
			return keywords.join(', ');
		},
		resultParser: (text) => parseStructuredArrayResponses(text),
		completionOptions: () => ({
			...DEFAULT_STRUCTURED_OUTPUT_OPTIONS,
			grammar: arrayToGbnf(
				viewState.categories.map((c) => c.name),
				{ minItems: 1, maxItems: 1 }
			)
		})
	});
}

export function buildTask(def: IaTaskDef, id: string): Task {
	return buildIaTask(id, def)(undefined);
}
