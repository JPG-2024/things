import { z } from 'zod';
import { buildIaTask, buildScriptTaskFromDef, iaTask, scriptTask } from '@/runners/taskSchema';
import type { IaTaskDef, ScriptTaskDef, TaskRunContext } from '@/runners/taskSchema';
import { parseStructuredArrayResponses } from '@/lib/utils/helpers/tasks';
import { arrayToGbnf, stringArrayGbnf } from '@/lib/utils/gbnf';
import { chatCompletions } from '@/lib/utils/inference/chat-completions-provider';
import {
	DEFAULT_IA_COMPLETION_OPTIONS,
	DEFAULT_STRUCTURED_OUTPUT_OPTIONS,
	DEFAULT_TITLE_COMPLETION_OPTIONS,
	SUMMARY_COMPLETION_OPTIONS
} from '@/lib/utils/inference/constants';
import { splitForEmbeddings } from '@/lib/utils/splitText';
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

export type ExtractionTaskOptions = Omit<IaTaskFactoryOptions<string[]>, 'run' | 'resultParser'> & {
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
		subtype,
		...rest
	} = stripUndefined(options);
	const sourceDependency = dependencies[0];

	return createIaTask({
		component: 'keywords',
		...rest,
		dependencies,
		subtype: subtype ?? 'extraction',
		extractorConfig: extractor,
		output: z.array(z.string()),
		systemMessage:
			systemMessage ??
			`You are a data extraction assistant. Return only a JSON array of exactly ${extractor.count} ${extractor.description}. No markdown, no explanations.`,
		userMessage:
			userMessage ?? `Extract ${extractor.count} ${extractor.description}. Respond in JSON format.`,
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

export type RecursiveContentResult = {
	chunks: string[];
	rawChunks: string[];
	finalResponse: string;
};

export type CreateRecursiveContentTaskOptions = {
	name?: string;
	dependencies?: string[];
	windowSize?: number;
	overlap?: number;
	systemMessage?: string;
	userMessage?: string;
	finalUserMessage?: string;
	completionOptions?: Record<string, unknown>;
	persist?: boolean;
	renderOrder?: number;
	gridSpan?: 1 | 2 | 3;
	component?: string;
	componentProps?: MaybeFn<Record<string, unknown>>;
	onComplete?: (params: {
		result: unknown;
		runResult: string;
		context: unknown;
		state: Readonly<Record<string, unknown>>;
	}) => void | Promise<void>;
};

const RECURSIVE_CONTENT_OUTPUT_SCHEMA = z.object({
	chunks: z.array(z.string()),
	rawChunks: z.array(z.string()),
	finalResponse: z.string()
});

export function createRecursiveContentTask(
	options?: CreateRecursiveContentTaskOptions
): ScriptTaskDef<typeof RECURSIVE_CONTENT_OUTPUT_SCHEMA> {
	const dependencies = options?.dependencies ?? ['content'];
	const sourceDependency = dependencies[0];

	return scriptTask({
		name: options?.name,
		subtype: 'recursive',
		dependencies,
		component: options?.component ?? 'recursive',
		componentProps: options?.componentProps,
		gridSpan: options?.gridSpan,
		renderOrder: options?.renderOrder,
		persist: options?.persist,
		output: RECURSIVE_CONTENT_OUTPUT_SCHEMA,
		run: async ({ state, update }) => {
			const content = state[sourceDependency];
			if (typeof content !== 'string')
				throw new Error(`Missing content from dependency "${sourceDependency}"`);

			const windowSize = options?.windowSize ?? 3000;
			const overlap = options?.overlap ?? Math.floor(windowSize * 0.1);
			const sections = splitForEmbeddings(content, { windowSize, overlap }).map((c) => c.text);

			const systemMsg =
				options?.systemMessage ??
				'You are a professional content summarizer. Write a concise and clear summary, only summmary. no titles';
			const chunkPrompt =
				options?.userMessage ?? 'Summarize this section concisely, only summmary. no titles';
			const finalPrompt =
				options?.finalUserMessage ??
				'Combine these section summaries into one coherent summary. no title.';
			const model = (options?.completionOptions as { model?: string })?.model ?? 'llama-server';
			const baseOpts = options?.completionOptions ?? SUMMARY_COMPLETION_OPTIONS;

			const chunks: string[] = [];

			for (const chunk of sections) {
				const response = await chatCompletions({
					...baseOpts,
					model,
					stream: false,
					messages: [
						{ role: 'system', content: systemMsg },
						{ role: 'user', content: `${chunkPrompt}\n\n${chunk}` }
					]
				});
				const text = response.choices?.[0]?.message?.content ?? '';
				chunks.push(typeof text === 'string' ? text.trim() : '');
			}

			const combined = chunks.join('\n\n');
			const finalCompletion = await chatCompletions({
				...baseOpts,
				model,
				stream: false,
				messages: [
					{ role: 'system', content: systemMsg },
					{ role: 'user', content: `${finalPrompt}\n\n${combined}` }
				]
			});
			const finalText = finalCompletion.choices?.[0]?.message?.content ?? '';
			const finalResponse = typeof finalText === 'string' ? finalText.trim() : '';

			return { chunks, rawChunks: sections, finalResponse };
		}
	});
}

export interface RecursiveConfig {
	windowSize: number;
	overlap: number;
	userMessage: string;
	finalUserMessage: string;
}

export function buildRecursiveTask(
	id: string,
	options: CreateRecursiveContentTaskOptions & { model?: string }
): Task {
	const windowSize = options.windowSize ?? 1000;
	const overlap = options.overlap ?? Math.floor(windowSize * 0.1);
	const userMessage = options.userMessage ?? 'Summarize this section concisely.';
	const finalUserMessage =
		options.finalUserMessage ?? 'Combine these section summaries into one coherent summary.';

	const def = createRecursiveContentTask({
		...options,
		completionOptions: options.completionOptions ?? {
			...SUMMARY_COMPLETION_OPTIONS,
			model: options.model ?? 'llama-server'
		},
		componentProps: {
			...((typeof options.componentProps === 'object' && options.componentProps !== null
				? options.componentProps
				: {}) as Record<string, unknown>),
			recursiveConfig: {
				windowSize,
				overlap,
				userMessage,
				finalUserMessage
			} satisfies RecursiveConfig
		}
	});
	return buildScriptTaskFromDef(id, def);
}

export type CreateCategoryTaskOptions = {
	keywordsDependency?: string;
	categoryNames?: string[];
	maxItems?: number;
	dependencies?: string[];
	systemMessage?: MaybeFn<string>;
	userMessage?: MaybeFn<string>;
	completionOptions?: MaybeFn<Record<string, unknown>>;
	model?: string;
	name?: string;
	component?: string;
	componentProps?: MaybeFn<Record<string, unknown>>;
	gridSpan?: 1 | 2 | 3;
	enableTTS?: boolean;
	persist?: boolean;
	renderOrder?: number;
};

export function createCategoryTask(
	options?: CreateCategoryTaskOptions
): IaTaskDef<z.ZodArray<z.ZodString>, unknown, string[]> {
	const {
		keywordsDependency,
		categoryNames: providedNames,
		maxItems = 1,
		dependencies: providedDeps,
		systemMessage: providedSystemMessage,
		userMessage: providedUserMessage,
		completionOptions: providedCompletionOptions,
		model,
		persist,
		renderOrder,
		...rest
	} = stripUndefined(options ?? {});

	const deps = providedDeps ?? [keywordsDependency ?? 'keywords'];
	const catDesc = maxItems === 1 ? 'category' : 'categories';
	const countBasedSysMsg = maxItems === 1 ? 'a single category name' : `${maxItems} category names`;
	const countBasedUserMsg = maxItems === 1 ? 'a category' : `${maxItems} categories`;

	const getNames = providedNames
		? () => providedNames
		: () => viewState.categories.map((c) => c.name);

	const systemMsg =
		providedSystemMessage ??
		`You are a data extraction assistant. Return only a JSON array with exactly ${countBasedSysMsg}. No markdown, no explanations.`;

	const userMsg =
		providedUserMessage ??
		(() => {
			const names = getNames();
			return `Give ${countBasedUserMsg} from this ones: ${names.join(', ')}.`;
		});

	const completionOpts =
		providedCompletionOptions ??
		(() => ({
			...DEFAULT_STRUCTURED_OUTPUT_OPTIONS,
			...(model ? { model } : {}),
			grammar: arrayToGbnf(getNames(), { minItems: maxItems, maxItems })
		}));

	const def = createExtractionTask({
		...rest,
		extractor: { count: maxItems, description: catDesc },
		dependencies: deps,
		component: rest.component ?? 'keywords',
		componentProps: rest.componentProps ?? { showPoint: false },
		persist,
		renderOrder,
		subtype: 'category',
		systemMessage: systemMsg,
		userMessage: userMsg,
		completionOptions: completionOpts
	});

	return { ...def, categoryNames: providedNames };
}

export function buildTask(def: IaTaskDef, id: string): Task {
	return buildIaTask(id, def)(undefined);
}
