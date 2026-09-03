import { chatCompletions } from '@/lib/utils/inference/chat-completions-provider';
import { viewState } from '@/stores/viewStore.svelte';
import { buildRecursiveTask } from '@/runners/shared/recursiveTask';
import { buildTask, createCategoryTask, createTitleTask } from '@/runners/shared/taskFactories';
import type { Task } from '@/types/taskRunner.types';
import {
	DEFAULT_CATEGORY_DESCRIPTION_COMPLETION_OPTIONS,
	DEFAULT_EMOJI_COMPLETION_OPTIONS
} from '@/lib/utils/inference/constants';

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
	const summaryDef = buildRecursiveTask('summary', {
		processorType: 'summarize',
		dependencies: [contentDependency],
		persist: true,
		renderOrder: 3,
		model: viewState.aiModel
	});

	const keywordsDef = buildRecursiveTask('keywords', {
		processorType: 'extraction',
		extractorConfig: { count: 10, description: 'keywords' },
		dependencies: [contentDependency],
		persist: true,
		renderOrder: 4,
		model: viewState.aiModel
	});

	const categoryDef = createCategoryTask({ persist: true, renderOrder: 5 });

	const titleDef = createTitleTask({
		dependencies: ['summary'],
		persist: true,
		renderOrder: 0.1
	});

	return [
		summaryDef,
		keywordsDef,
		buildTask('category', categoryDef),
		buildTask('title', titleDef)
	];
}
