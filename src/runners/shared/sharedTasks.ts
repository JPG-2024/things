import { chatCompletions } from '@/lib/utils/inference/chat-completions-provider';
import { assistantText } from '@/lib/utils/inference/assistant-text';
import { viewState } from '@/stores/viewStore.svelte';
import { buildRecursiveTask, type RecursiveTaskOptions } from '@/runners/shared/recursiveTask';
import { buildTask, createCategoryTask, createTitleTask } from '@/runners/shared/taskFactories';
import { DEFAULT_MULTI_FIELDS } from '@/runners/shared/processors/multi';
import {
	DEFAULT_KEYWORD_COUNT,
	DEFAULT_TOPIC_COUNT,
	DEFAULT_TOPIC_WORD_COUNT
} from '@/runners/shared/processors/analysisTopic';
import type { Task } from '@/types/taskRunner.types';
import {
	ANALYSIS_COMPLETION_OPTIONS,
	DEFAULT_EMOJI_COMPLETION_OPTIONS
} from '@/lib/utils/inference/constants';
import { EMOJI_SYSTEM_MESSAGE } from '@/lib/utils/inference/prompts';

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
				{ role: 'system', content: EMOJI_SYSTEM_MESSAGE },
				{ role: 'user', content: trimmed }
			]
		});
		return parseEmojiResponse(assistantText(response));
	} catch {
		return '';
	}
}

export const DEFAULT_TASK_IDS = ['analysis', 'category', 'title'] as const;

export type DefaultAnalysisKind = 'multi' | 'analysisTopic';

export function createDefaultTasks(
	contentDependency: string = 'content',
	options: {
		splitByHeaders?: boolean;
		analysis?: DefaultAnalysisKind;
		topicCount?: number;
		keywordCount?: number;
		topicWordCount?: number;
		embedField?: string;
	} = {}
): Task[] {
	const analysisKind: DefaultAnalysisKind = options.analysis ?? 'multi';

	const shared: RecursiveTaskOptions = {
		dependencies: [contentDependency],
		persist: true,
		renderOrder: 3,
		gridSpan: 1,
		model: viewState.aiModel,
		splitByHeaders: options.splitByHeaders,
		enableTTS: true,
		embeddings: true,
		storeChunkText: true,
		embedField: options.embedField ?? 'topics',
		completionOptions: ANALYSIS_COMPLETION_OPTIONS
	};

	const kindOptions: RecursiveTaskOptions =
		analysisKind === 'analysisTopic'
			? {
					processorType: 'analysisTopic',
					component: 'analysisTopic',
					// Born pinned to the depth chosen in Settings (default: the two-
					// window pass). The depth table overrides the topic count below.
					analysisDepth: viewState.analysisDepth,
					topicCount: options.topicCount ?? DEFAULT_TOPIC_COUNT,
					keywordCount: options.keywordCount ?? DEFAULT_KEYWORD_COUNT,
					topicWordCount: options.topicWordCount ?? DEFAULT_TOPIC_WORD_COUNT
				}
			: {
					processorType: 'multi',
					component: 'multiAnalysis',
					combineMode: 'llm',
					multiFields: DEFAULT_MULTI_FIELDS,
					localFinal: true
				};

	const analysisDef = buildRecursiveTask('analysis', { ...shared, ...kindOptions });

	const categoryDef = createCategoryTask({
		persist: true,
		renderOrder: 0.5,
		// Depend on `title` so the article title is ready when classification
		// runs (otherwise the two are siblings and race).
		dependencies: ['analysis', 'title']
	});

	const titleDef = createTitleTask({
		dependencies: ['analysis'],
		persist: true,
		renderOrder: 0.1,
		visible: false
	});

	return [analysisDef, buildTask('category', categoryDef), buildTask('title', titleDef)];
}
