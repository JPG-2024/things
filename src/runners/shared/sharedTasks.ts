import { z } from 'zod';
import { iaTask } from '@/runners/taskSchema';
import { chatCompletions } from '@/lib/utils/inference/chat-completions-provider';
import { viewState } from '@/stores/viewStore.svelte';
import {
	buildTask,
	createCategoryTask,
	createExtractionTask,
	createSummaryTask,
	createTitleTask
} from '@/runners/shared/taskFactories';
import type { Task } from '@/types/taskRunner.types';
import {
	DEFAULT_CATEGORY_DESCRIPTION_COMPLETION_OPTIONS,
	DEFAULT_EMOJI_COMPLETION_OPTIONS
} from '@/lib/utils/inference/constants';

export const SHARED_TASK_IDS = {
	KEYWORDS: 'keywords',
	CATEGORY: 'category',
	EMOJIS: 'emojis',
	TITLE: 'title',
	EMOJI_FROM_STRING: 'emoji-from-string',
	SUMMARY: 'summary'
} as const;

export const sharedOutputSchemas = {
	[SHARED_TASK_IDS.KEYWORDS]: z.array(z.string()),
	[SHARED_TASK_IDS.CATEGORY]: z.array(z.string()),
	[SHARED_TASK_IDS.EMOJIS]: z.array(z.string()),
	[SHARED_TASK_IDS.TITLE]: z.string(),
	[SHARED_TASK_IDS.EMOJI_FROM_STRING]: z.string()
} as const;

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

export async function generateCategoryDescription(name: string): Promise<string> {
	const trimmed = name.trim();
	if (!trimmed) return '';
	try {
		const response = await chatCompletions({
			model: viewState.aiModel,
			...DEFAULT_CATEGORY_DESCRIPTION_COMPLETION_OPTIONS,
			stream: false,
			messages: [
				{
					role: 'system',
					content:
						'Write a short one-sentence description for the given category name. Respond with only the description, no quotes, no prefixes.'
				},
				{ role: 'user', content: trimmed }
			]
		});
		const rawContent = response.choices?.[0]?.message?.content ?? '';
		return typeof rawContent === 'string' ? rawContent.trim() : '';
	} catch {
		return '';
	}
}

export function createDefaultTasks(contentDependency: string = 'content'): Task[] {
	const summaryDef = createSummaryTask({
		dependencies: [contentDependency],
		systemMessage:
			'You are a professional content summarizer. Write a concise summary in 2-3 sentences.',
		userMessage: 'Summarize the following content briefly 2 paraphs.',
		persist: true,
		renderOrder: 3
	});

	const keywordsDef = createExtractionTask({
		extractor: { count: 10, description: 'keywords' },
		dependencies: [contentDependency],
		persist: true,
		renderOrder: 4
	});

	const categoryDef = createCategoryTask({ persist: true, renderOrder: 5 });

	const titleDef = createTitleTask({
		dependencies: [SHARED_TASK_IDS.SUMMARY],
		userMessage: 'Write a title of one sentence. star with an emoji.',
		persist: true,
		renderOrder: 0.1
	});

	return [
		buildTask(summaryDef, SHARED_TASK_IDS.SUMMARY),
		buildTask(keywordsDef, SHARED_TASK_IDS.KEYWORDS),
		buildTask(categoryDef, SHARED_TASK_IDS.CATEGORY),
		buildTask(titleDef, SHARED_TASK_IDS.TITLE)
	];
}

export const sharedTasks = {
	[SHARED_TASK_IDS.KEYWORDS]: createExtractionTask({
		extractor: { count: 10, description: 'keywords' }
	}),

	[SHARED_TASK_IDS.EMOJIS]: createExtractionTask({
		extractor: { count: 5, description: 'Emojis' },
		dependencies: ['title-summary']
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

	[SHARED_TASK_IDS.CATEGORY]: createCategoryTask({ persist: true })
};
