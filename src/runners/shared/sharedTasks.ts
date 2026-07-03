import { z } from 'zod';
import { iaTask } from '@/runners/taskSchema';
import { parseStructuredArrayResponses } from '@/lib/utils/helpers/tasks';
import { arrayToGbnf, stringArrayGbnf } from '@/lib/utils/gbnf';
import { viewState } from '@/stores/viewStore.svelte';

export const SHARED_TASK_IDS = {
	KEYWORDS: 'keywords',
	CATEGORY: 'category'
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
	[SHARED_TASK_IDS.CATEGORY]: z.array(z.string())
} as const;

export const sharedTasks = {
	[SHARED_TASK_IDS.KEYWORDS]: iaTask({
		dependencies: ['content'],
		component: 'keywords',
		output: sharedOutputSchemas[SHARED_TASK_IDS.KEYWORDS],
		systemMessage:
			'You are a data extraction assistant. Return only a JSON array of exactly 10 keywords. No markdown, no explanations.',
		userMessage: 'extract 10 keywords. respond in JSON format.',
		run: ({ state }) => {
			const content = state['content'];
			if (typeof content !== 'string') throw new Error('CONTENT is missing or invalid');
			return content;
		},
		resultParser: (text) => parseStructuredArrayResponses(text),
		completionOptions: {
			...structuredOutputOptions,
			grammar: stringArrayGbnf(10)
		}
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
