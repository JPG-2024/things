import { z } from 'zod';
import { iaTask } from '@/runners/taskSchema';
import { parseStructuredArrayResponses } from '@/lib/utils/helpers/tasks';
import { arrayToGbnf, stringArrayGbnf } from '@/lib/utils/gbnf';
import { chatCompletions } from '@/lib/utils/chat-completions-provider';
import { viewState } from '@/stores/viewStore.svelte';

export const SHARED_TASK_IDS = {
	KEYWORDS: 'keywords',
	CATEGORY: 'category',
	EMOJIS: 'emojis',
	TITLE: 'title',
	EMOJI_FROM_STRING: 'emoji-from-string'
} as const;

const structuredOutputOptions = {
	temperature: 0.1,
	top_k: 40,
	min_p: 0.05,
	presence_penalty: 0,
	n_predict: 256,
	stream: false
} as const;

export const sharedOutputSchemas = {
	[SHARED_TASK_IDS.KEYWORDS]: z.array(z.string()),
	[SHARED_TASK_IDS.CATEGORY]: z.array(z.string()),
	[SHARED_TASK_IDS.EMOJIS]: z.array(z.string()),
	[SHARED_TASK_IDS.TITLE]: z.string(),
	[SHARED_TASK_IDS.EMOJI_FROM_STRING]: z.string()
} as const;

interface CreateExtractorTaskOptions {
	count: number;
	description: string;
	component: string;
	dependency?: string;
}

const DEFAULT_TITLE_COMPLETION_OPTIONS = {
	temperature: 0.7,
	top_p: 0.9,
	max_tokens: 20,
	frequency_penalty: 0.4,
	presence_penalty: 0.1,
	stop: ['\n', '. ', '? ', '! '],
	seed: 42
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

interface CreateTitleTaskOptions {
	systemMessage?:
		| string
		| ((ctx: { context: unknown; state: Readonly<Record<string, unknown>> }) => string);
	userMessage?:
		| string
		| ((ctx: { context: unknown; state: Readonly<Record<string, unknown>> }) => string);
	completionOptions?: Record<string, unknown>;
	persist?: boolean;
	gridSpan?: 1 | 2 | 3;
}

export function createTitleTaskConfig(options?: CreateTitleTaskOptions) {
	const defaultUserMessage: (ctx: {
		context: unknown;
		state: Readonly<Record<string, unknown>>;
	}) => string = ({ context }) => {
		const lang = (context as { language?: string })?.language;
		return `Create a short title describing the content. No more than 10 words. Start with an emoji. Answer in ${lang === 'es' ? 'Spanish' : 'English'}.`;
	};

	return {
		name: 'Title',
		dependencies: ['title-summary'],
		component: 'taskBase',
		output: z.string(),
		systemMessage: options?.systemMessage ?? 'Avoid Markdown.',
		userMessage: options?.userMessage ?? defaultUserMessage,
		run: ({ state }: { state: Record<string, unknown> }) => {
			const titleSummary = state['title-summary'];
			if (typeof titleSummary !== 'string') throw new Error('TITLE_SUMMARY is missing or invalid');
			return titleSummary;
		},
		completionOptions: options?.completionOptions ?? DEFAULT_TITLE_COMPLETION_OPTIONS,
		persist: options?.persist,
		gridSpan: options?.gridSpan
	};
}

export function createTitleTask(options?: CreateTitleTaskOptions) {
	return iaTask(createTitleTaskConfig(options));
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
		},
		extractorConfig: { count, description }
	});
}

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
		dependency: 'title-summary',
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
