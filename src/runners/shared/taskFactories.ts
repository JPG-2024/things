import { z } from 'zod';
import {
	buildIaTask,
	iaTask,
	requireFinalResponseString,
	requireStringState
} from '@/runners/taskSchema';
import type { IaTaskDef } from '@/runners/taskSchema';
import { parseStructuredArrayResponses } from '@/lib/utils/helpers/tasks';
import { arrayToGbnf } from '@/lib/utils/gbnf';
import {
	DEFAULT_DYNAMIC_MODEL,
	DEFAULT_IA_COMPLETION_OPTIONS,
	DEFAULT_STRUCTURED_OUTPUT_OPTIONS,
	DEFAULT_TITLE_COMPLETION_OPTIONS,
	SUMMARY_COMPLETION_OPTIONS
} from '@/lib/utils/inference/constants';
import { buildExtractionCompletionOptions } from '@/lib/utils/inference/extraction-helper';
import {
	buildCategorySystemMessage,
	buildCategoryUserMessage,
	buildExtractionSystemMessage,
	buildExtractionUserMessage,
	buildTitleUserMessage,
	DEFAULT_IA_SYSTEM_MESSAGE,
	SUMMARY_SYSTEM_MESSAGE,
	SUMMARY_USER_MESSAGE,
	TITLE_SYSTEM_MESSAGE
} from '@/lib/utils/inference/prompts';
import { viewState } from '@/stores/viewStore.svelte';
import type { ExtractorConfig, Task } from '@/types/taskRunner.types';

export type IaTaskFactoryOptions<TOutput extends z.core.$ZodType = z.ZodString> = Partial<
	Omit<IaTaskDef<TOutput>, 'output' | 'type' | 'extractorConfig'>
> & {
	output?: TOutput;
	model?: string;
};

export function createIaTask<TOutput extends z.core.$ZodType = z.ZodString>(
	options: IaTaskFactoryOptions<TOutput> = {}
): IaTaskDef<TOutput> {
	const { model, output, component, systemMessage, userMessage, completionOptions, ...rest } =
		options;

	return iaTask({
		...rest,
		component: component ?? 'taskBase',
		systemMessage: systemMessage ?? DEFAULT_IA_SYSTEM_MESSAGE,
		userMessage: userMessage ?? '',
		output: (output ?? z.string()) as TOutput,
		completionOptions: completionOptions ?? {
			...DEFAULT_IA_COMPLETION_OPTIONS,
			model: model ?? DEFAULT_DYNAMIC_MODEL
		}
	});
}

export type ExtractionTaskOptions = Omit<
	IaTaskFactoryOptions<z.ZodArray<z.ZodString>>,
	'output' | 'run' | 'resultParser'
> & {
	extractor: ExtractorConfig;
};

export function createExtractionTask(
	options: ExtractionTaskOptions
): IaTaskDef<z.ZodArray<z.ZodString>> {
	const {
		extractor,
		dependencies = ['content'],
		component,
		subtype,
		systemMessage,
		userMessage,
		completionOptions,
		model,
		...rest
	} = options;

	return createIaTask({
		...rest,
		dependencies,
		component: component ?? 'keywords',
		subtype: subtype ?? 'extraction',
		output: z.array(z.string()),
		systemMessage:
			systemMessage ?? buildExtractionSystemMessage(extractor.count, extractor.description),
		userMessage: userMessage ?? buildExtractionUserMessage(extractor.count, extractor.description),
		resultParser: (text) => parseStructuredArrayResponses(text),
		completionOptions:
			completionOptions ??
			buildExtractionCompletionOptions(extractor.count, model ?? DEFAULT_DYNAMIC_MODEL)
	});
}

export type CreateTitleTaskOptions = Omit<IaTaskFactoryOptions, 'output' | 'run' | 'subtype'>;

export function createTitleTask(options: CreateTitleTaskOptions = {}): IaTaskDef<z.ZodString> {
	const {
		name,
		dependencies = ['title-summary'],
		renderOrder,
		systemMessage,
		userMessage,
		completionOptions,
		...rest
	} = options;
	const sourceDependency = dependencies[0];

	return createIaTask({
		...rest,
		name: name ?? 'Title',
		dependencies,
		subtype: 'title',
		renderOrder: renderOrder ?? 1,
		systemMessage: systemMessage ?? TITLE_SYSTEM_MESSAGE,
		userMessage:
			userMessage ??
			(({ context }) => {
				const lang = (context as { language?: string })?.language;
				return buildTitleUserMessage(lang);
			}),
		run: ({ state }) => requireFinalResponseString(state, sourceDependency),
		completionOptions: completionOptions ?? DEFAULT_TITLE_COMPLETION_OPTIONS
	});
}

export type CreateSummaryTaskOptions = Omit<IaTaskFactoryOptions, 'output' | 'run' | 'subtype'>;

export function createSummaryTask(options: CreateSummaryTaskOptions = {}): IaTaskDef<z.ZodString> {
	const {
		dependencies = ['content'],
		systemMessage,
		userMessage,
		completionOptions,
		...rest
	} = options;
	const sourceDependency = dependencies[0];

	return createIaTask({
		...rest,
		dependencies,
		systemMessage: systemMessage ?? SUMMARY_SYSTEM_MESSAGE,
		userMessage: userMessage ?? SUMMARY_USER_MESSAGE,
		run: ({ state }) => requireStringState(state, sourceDependency),
		completionOptions: completionOptions ?? SUMMARY_COMPLETION_OPTIONS
	});
}

export type CreateCategoryTaskOptions = Omit<
	IaTaskFactoryOptions<z.ZodArray<z.ZodString>>,
	'output' | 'run' | 'resultParser' | 'subtype' | 'extractorConfig'
> & {
	keywordsDependency?: string;
	maxItems?: number;
};

export function createCategoryTask(
	options: CreateCategoryTaskOptions = {}
): IaTaskDef<z.ZodArray<z.ZodString>> {
	const {
		keywordsDependency,
		categoryNames,
		maxItems = 1,
		dependencies,
		component,
		componentProps,
		systemMessage,
		userMessage,
		completionOptions,
		model,
		...rest
	} = options;

	const deps = dependencies ?? [keywordsDependency ?? 'keywords'];
	const countDescription = maxItems === 1 ? 'category' : 'categories';

	const resolveNames = () => categoryNames ?? viewState.categories.map((c) => c.name);
	const resolveListedNames = () =>
		categoryNames ??
		viewState.categories.map((c) => (c.description ? `${c.name}: (${c.description})` : c.name));

	const def = createExtractionTask({
		...rest,
		categoryNames,
		dependencies: deps,
		component: component ?? 'keywords',
		componentProps: componentProps ?? { showPoint: false },
		subtype: 'category',
		extractor: { count: maxItems, description: countDescription },
		systemMessage: systemMessage ?? buildCategorySystemMessage(maxItems),
		userMessage: userMessage ?? (() => buildCategoryUserMessage(maxItems, resolveListedNames())),
		completionOptions:
			completionOptions ??
			(() => ({
				...DEFAULT_STRUCTURED_OUTPUT_OPTIONS,
				...(model ? { model } : {}),
				grammar: arrayToGbnf(resolveNames(), { minItems: maxItems, maxItems })
			}))
	});

	return {
		...def,
		directResult: () =>
			viewState.selectedCategories.length > 0 ? viewState.selectedCategories : null
	};
}

export function buildTask(id: string, def: IaTaskDef): Task {
	return buildIaTask(id, def)(undefined);
}
