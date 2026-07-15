import { z } from 'zod';
import { iaTask } from '@/runners/taskSchema';
import { parseStructuredArrayResponses } from '@/lib/utils/helpers/tasks';
import { arrayToGbnf } from '@/lib/utils/gbnf';
import { chatCompletions } from '@/lib/utils/chat-completions-provider';
import { viewState } from '@/stores/viewStore.svelte';
import {
	structuredOutputOptions,
	createExtractorTask,
	createTitleTask
} from '@/runners/shared/dynamicTasks';

export const SHARED_TASK_IDS = {
	KEYWORDS: 'keywords',
	CATEGORY: 'category',
	EMOJIS: 'emojis',
	TITLE: 'title',
	EMOJI_FROM_STRING: 'emoji-from-string'
} as const;

export const sharedOutputSchemas = {
	[SHARED_TASK_IDS.KEYWORDS]: z.array(z.string()),
	[SHARED_TASK_IDS.CATEGORY]: z.array(z.string()),
	[SHARED_TASK_IDS.EMOJIS]: z.array(z.string()),
	[SHARED_TASK_IDS.TITLE]: z.string(),
	[SHARED_TASK_IDS.EMOJI_FROM_STRING]: z.string()
} as const;

const DEFAULT_EMOJI_COMPLETION_OPTIONS = {
	temperature: 0.1,
	top_p: 0.9,
	max_tokens: 5,
	frequency_penalty: 0,
	presence_penalty: 0,
	stop: ['\n'],
	seed: 42
};

function extractFirstGrapheme(text: string): string {
	const trimmed = text.trim();
	if (!trimmed) return '';
	if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
		const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
		const first = segmenter.segment(trimmed)[Symbol.iterator]().next().value;
		return first?.segment ?? trimmed;
	}
	return trimmed;
}

function parseEmojiResponse(text: string): string {
	return extractFirstGrapheme(text);
}

export async function generateEmojiForText(text: string): Promise<string> {
	const trimmed = text.trim();
	if (!trimmed) return '';
	try {
		const response = await chatCompletions({
			model: viewState.aiModel,
			...DEFAULT_EMOJI_COMPLETION_OPTIONS,
			stream: false,
			messages: [
				{
					role: 'system',
					content:
						'Return exactly one emoji that best represents the user text. Respond with only the emoji and nothing else.'
				},
				{ role: 'user', content: trimmed }
			]
		});
		const rawContent = response.choices?.[0]?.message?.content ?? '';
		const content = typeof rawContent === 'string' ? rawContent : '';
		return parseEmojiResponse(content);
	} catch {
		return '';
	}
}

export const sharedTasks = {
	[SHARED_TASK_IDS.KEYWORDS]: createExtractorTask({
		count: 10,
		description: 'keywords',
		component: 'keywords'
	}),

	[SHARED_TASK_IDS.EMOJIS]: createExtractorTask({
		count: 5,
		dependencies: ['title-summary'],
		description: 'Emojis',
		component: 'keywords'
	}),

	[SHARED_TASK_IDS.TITLE]: createTitleTask(),

	[SHARED_TASK_IDS.EMOJI_FROM_STRING]: iaTask({
		dependencies: [],
		output: sharedOutputSchemas[SHARED_TASK_IDS.EMOJI_FROM_STRING],
		systemMessage:
			'Return exactly one emoji that best represents the user text. Respond with only the emoji and nothing else.',
		userMessage: 'Return exactly one emoji for the given text.',
		run: ({ context }) => {
			const text = (context as { text?: string })?.text ?? '';
			return text;
		},
		resultParser: (text) => parseEmojiResponse(text),
		completionOptions: DEFAULT_EMOJI_COMPLETION_OPTIONS
	}),

	[SHARED_TASK_IDS.CATEGORY]: iaTask({
		dependencies: [SHARED_TASK_IDS.KEYWORDS],
		component: 'keywords',
		output: sharedOutputSchemas[SHARED_TASK_IDS.CATEGORY],
		componentProps: { showPoint: false },
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
