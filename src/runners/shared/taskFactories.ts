import { buildIaTask, iaTask, requireFinalResponseString } from '@/runners/taskSchema';
import { classifyByEmbedding } from '@/lib/utils/categoryEmbeddings';
import type { IaTaskDef } from '@/runners/taskSchema';
import { parseStructuredArrayResponses } from '@/lib/utils/helpers/tasks';
import { arrayToGbnf } from '@/lib/utils/gbnf';
import {
	DEFAULT_DYNAMIC_MODEL,
	DEFAULT_IA_COMPLETION_OPTIONS,
	DEFAULT_STRUCTURED_OUTPUT_OPTIONS,
	DEFAULT_TITLE_COMPLETION_OPTIONS
} from '@/lib/utils/inference/constants';
import { buildExtractionCompletionOptions } from '@/lib/utils/inference/extraction-helper';
import {
	buildCategorySystemMessage,
	buildCategoryUserMessage,
	buildExtractionSystemMessage,
	buildExtractionUserMessage,
	buildTitleUserMessage,
	DEFAULT_IA_SYSTEM_MESSAGE,
	TITLE_SYSTEM_MESSAGE
} from '@/lib/utils/inference/prompts';
import { viewState } from '@/stores/viewStore.svelte';
import type { ExtractorConfig, Task } from '@/types/taskRunner.types';

export type IaTaskFactoryOptions<TParsed = string> = Partial<
	Omit<IaTaskDef<TParsed>, 'type' | 'extractorConfig'>
> & {
	model?: string;
};

export function createIaTask<TParsed = string>(
	options: IaTaskFactoryOptions<TParsed> = {}
): IaTaskDef<TParsed> {
	const { model, component, systemMessage, userMessage, completionOptions, ...rest } = options;

	return iaTask<TParsed>({
		...rest,
		component: component ?? 'taskBase',
		systemMessage: systemMessage ?? DEFAULT_IA_SYSTEM_MESSAGE,
		userMessage: userMessage ?? '',
		completionOptions: completionOptions ?? {
			...DEFAULT_IA_COMPLETION_OPTIONS,
			model: model ?? DEFAULT_DYNAMIC_MODEL
		}
	});
}

export type ExtractionTaskOptions = Omit<IaTaskFactoryOptions<string[]>, 'run' | 'resultParser'> & {
	extractor: ExtractorConfig;
};

export function createExtractionTask(options: ExtractionTaskOptions): IaTaskDef<string[]> {
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

	return createIaTask<string[]>({
		...rest,
		dependencies,
		component: component ?? 'keywords',
		subtype: subtype ?? 'extraction',
		systemMessage:
			systemMessage ?? buildExtractionSystemMessage(extractor.count, extractor.description),
		userMessage: userMessage ?? buildExtractionUserMessage(extractor.count, extractor.description),
		resultParser: (text) => parseStructuredArrayResponses(text),
		completionOptions:
			completionOptions ??
			buildExtractionCompletionOptions(extractor.count, model ?? DEFAULT_DYNAMIC_MODEL)
	});
}

export type CreateTitleTaskOptions = Omit<IaTaskFactoryOptions, 'run' | 'subtype'>;

export function createTitleTask(options: CreateTitleTaskOptions = {}): IaTaskDef<string> {
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

	return createIaTask<string>({
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

export type CreateCategoryTaskOptions = Omit<
	IaTaskFactoryOptions<string[]>,
	'run' | 'resultParser' | 'subtype' | 'extractorConfig'
> & {
	keywordsDependency?: string;
	maxItems?: number;
};

export function createCategoryTask(options: CreateCategoryTaskOptions = {}): IaTaskDef<string[]> {
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

	const resolveNames = () => categoryNames ?? viewState.categories.map((c) => c.name);
	const resolveListedNames = () =>
		categoryNames ??
		viewState.categories.map((c) => (c.description ? `${c.name}: (${c.description})` : c.name));

	const def = createIaTask<string[]>({
		...rest,
		categoryNames,
		dependencies: deps,
		component: component ?? 'keywords',
		componentProps: componentProps ?? { showPoint: false },
		subtype: 'category',
		systemMessage: systemMessage ?? buildCategorySystemMessage(maxItems),
		userMessage: userMessage ?? (() => buildCategoryUserMessage(maxItems, resolveListedNames())),
		resultParser: (text) => parseStructuredArrayResponses(text),
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
		directResult: (ctx) => {
			// Manual selection always wins.
			if (viewState.selectedCategories.length > 0) {
				return viewState.selectedCategories;
			}
			// Explicit lists (templates / custom tasks) keep the LLM + grammar path.
			if (categoryNames && categoryNames.length > 0) {
				return null;
			}
			// The health indicator is informational only: always attempt the
			// classification and let the embeddings call surface failures.
			const analysisData = ctx.state[deps[0]];
			return classifyByEmbedding(analysisData, {
				topN: viewState.categoryTopN,
				minSimilarity: viewState.categoryMinSimilarity
			});
		}
	};
}

export function buildTask(id: string, def: IaTaskDef): Task {
	return buildIaTask(id, def)(undefined);
}
