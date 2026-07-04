import { z } from 'zod';
import { iaTask } from '@/runners/taskSchema';
import { parseStructuredArrayResponses } from '@/lib/utils/helpers/tasks';
import { arrayToGbnf, stringArrayGbnf } from '@/lib/utils/gbnf';
import { viewState } from '@/stores/viewStore.svelte';

export const SHARED_TASK_IDS = {
	KEYWORDS: 'keywords',
	CATEGORY: 'category',
	EMOJIS: 'emojis'
} as const;

const structuredOutputOptions = {
	temperature: 0,
	top_p: 0.9,
	top_k: 1,
	presence_penalty: 0,
	stream: false
} as const;

export const sharedOutputSchemas = {
	[SHARED_TASK_IDS.KEYWORDS]: z.array(z.string()),
	[SHARED_TASK_IDS.CATEGORY]: z.array(z.string()),
	[SHARED_TASK_IDS.EMOJIS]: z.array(z.string())
} as const;

interface CreateExtractorTaskOptions {
	count: number;
	description: string;
	component: string;
	dependency?: string;
}

export function createExtractorTask(options: CreateExtractorTaskOptions) {
	const { count, description, component, dependency = 'content' } = options;

	return iaTask({
		dependencies: [dependency],
		component,
		output: z.array(z.string()),
		systemMessage: `You are a data extraction assistant. Return only a JSON array of exactly ${count} ${description}. No markdown, no explanations.`,
		userMessage: `Extract ${count} ${description}. Respond in JSON format.`,
		run: ({ state }) => {
			const content = state[dependency];
			if (typeof content !== 'string') throw new Error('CONTENT is missing or invalid');
			return content;
		},
		resultParser: (text) => parseStructuredArrayResponses(text),
		completionOptions: {
			...structuredOutputOptions,
			grammar: stringArrayGbnf(count)
		}
	});
}

export const sharedTasks = {
	[SHARED_TASK_IDS.KEYWORDS]: createExtractorTask({
		count: 10,
		description: 'keywords',
		component: 'keywords'
	}),

	[SHARED_TASK_IDS.EMOJIS]: createExtractorTask({
		count: 3,
		dependency: 'title-summary',
		description: 'Emojis',
		component: 'keywords'
	}),

	[SHARED_TASK_IDS.CATEGORY]: iaTask({
		dependencies: [SHARED_TASK_IDS.KEYWORDS],
		component: 'keywords',
		output: sharedOutputSchemas[SHARED_TASK_IDS.CATEGORY],
		systemMessage:
			'You are a data extraction assistant. Return only a JSON array with a single category name. No markdown, no explanations.',
		userMessage: () => {
			const categoryNames = viewState.categories.map((c) => c.name).join(', ');
			return `Give a category from this ones: ${categoryNames}.`;
		},
		run: ({ state }) => {
			const keywords = state[SHARED_TASK_IDS.KEYWORDS] as string[];
			return keywords.join(' ');
		},
		resultParser: (text) => {
			console.log(text);
			return parseStructuredArrayResponses(text);
		},
		completionOptions: () => ({
			...structuredOutputOptions,
			grammar: arrayToGbnf(
				viewState.categories.map((c) => c.name),
				{ minItems: 1, maxItems: 1 }
			)
		})
	})
};
