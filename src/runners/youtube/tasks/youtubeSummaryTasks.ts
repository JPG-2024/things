import { viewState } from '@/stores/viewStore.svelte';
import { createTitleTask, createSummaryTask } from '@/runners/shared/taskFactories';
import { TaskNames, type YouTubeTaskRegistrySubset } from './youtubeTasks.shared';
import { DEFAULT_YOUTUBE_COMPLETION_OPTIONS } from '@/lib/utils/inference/constants';

type SummaryTaskIds =
	| TaskNames.TITLE_SUMMARY
	| TaskNames.TITLE
	| TaskNames.KEYWORDS
	| TaskNames.KEYPOINTS;

export const summaryTaskRegistry: YouTubeTaskRegistrySubset<SummaryTaskIds> = {
	[TaskNames.TITLE_SUMMARY]: () => ({
		id: TaskNames.TITLE_SUMMARY,
		...createSummaryTask({
			name: 'Title Summary',
			systemMessage: `Focus on extracting:
- core ideas
- workflows
- technical concepts
- mindset shifts
- practical advice
- mistakes and lessons learned

Avoid summarizing small talk unless it adds context. got right to the point, no intros. dont use markdown. one paragraph.`,
			userMessage: 'Generate a short summary for this video.',
			completionOptions: DEFAULT_YOUTUBE_COMPLETION_OPTIONS
		})
	}),

	[TaskNames.TITLE]: ({ language }) => ({
		id: TaskNames.TITLE,
		...createTitleTask({ gridSpan: 1 }),
		renderOrder: 2
	}),

	[TaskNames.KEYWORDS]: () => ({
		id: TaskNames.KEYWORDS,
		dependencies: [TaskNames.CONTENT],
		component: 'keywords',
		type: 'ia',
		systemMessage: 'Return only valid JSON that matches the provided schema.',
		run: ({ state }) => {
			const content = state[TaskNames.CONTENT];

			if (typeof content !== 'string') {
				throw new Error('Content is missing or invalid');
			}

			return content;
		},
		userMessage: 'extract 5 keywords.',
		completionOptions: {
			...DEFAULT_YOUTUBE_COMPLETION_OPTIONS,
			temperature: 1.0,
			top_p: 0.95,
			top_k: 20,
			min_p: 0.0,
			presence_penalty: 1.5,
			repeat_penalty: 1.0,
			response_format: {
				type: 'json_schema',
				json_schema: {
					name: 'keywords',
					strict: true,
					schema: {
						type: 'object',
						properties: {
							keywords: {
								type: 'array',
								items: { type: 'string' },
								minItems: 5,
								maxItems: 5
							}
						},
						required: ['keywords'],
						additionalProperties: false
					}
				}
			}
		}
	}),

	[TaskNames.KEYPOINTS]: () => ({
		id: TaskNames.KEYPOINTS,
		name: 'Key points',
		dependencies: [TaskNames.CONTENT],
		component: 'listItems',
		type: 'ia',
		systemMessage: `Return only valid JSON that matches the provided schema. Response in language: ${viewState.language === 'es' ? 'Spanish' : 'English'}.`,
		run: ({ state }) => {
			const content = state[TaskNames.CONTENT];

			if (typeof content !== 'string') {
				throw new Error('Content is missing or invalid');
			}

			return content;
		},
		userMessage: `extract 8 keypoints describing the main information. Response in language: ${viewState.language === 'es' ? 'Spanish' : 'English'}.`,
		completionOptions: {
			...DEFAULT_YOUTUBE_COMPLETION_OPTIONS,
			temperature: 1.0,
			top_p: 0.95,
			top_k: 20,
			min_p: 0.0,
			presence_penalty: 1.5,
			repeat_penalty: 1.0,
			response_format: {
				type: 'json_schema',
				json_schema: {
					name: 'keypointsTitles',
					strict: true,
					schema: {
						type: 'object',
						properties: {
							keypointsTitles: {
								type: 'array',
								items: { type: 'string' },
								minItems: 8,
								maxItems: 8
							}
						},
						required: ['keypointsTitles'],
						additionalProperties: false
					}
				}
			}
		}
	})
};
