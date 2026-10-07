import { chatCompletions } from '@/lib/utils/inference/chat-completions-provider';
import { assistantAnswerText } from '@/lib/utils/inference/assistant-text';
import { MULTI_FIELD_COMPLETION_OPTIONS } from '@/lib/utils/inference/constants';
import {
	RECURSIVE_SUMMARY_FINAL_USER_MESSAGE,
	buildMultiFieldSystemMessage,
	buildMultiFieldUserMessage,
	buildRecursiveSummarySystemMessage
} from '@/lib/utils/inference/prompts';
import { multiFieldObjectGbnf, type MultiFieldSpec } from '@/lib/utils/gbnf';
import { viewState } from '@/stores/viewStore.svelte';
import { LANG_NAMES } from '@/constants';
import { parseMultiFieldResponse } from './multiParse';
import type { ProcessorDef, MultiChunkData, MultiFinal } from './types';

export const DEFAULT_MULTI_FIELDS: MultiFieldSpec[] = [
	{ key: 'summary', kind: 'string' },
	{ key: 'keywords', kind: 'string-array', count: 4 },
	{ key: 'topics', kind: 'string-array', count: 3 }
];

export const multiProcessor: ProcessorDef = {
	type: 'multi',
	defaults: {
		userMessage: buildMultiFieldUserMessage(4, 3),
		finalUserMessage: RECURSIVE_SUMMARY_FINAL_USER_MESSAGE
	},
	build: (config) => {
		const fields = config.multiFields ?? DEFAULT_MULTI_FIELDS;
		const grammar = multiFieldObjectGbnf(fields);
		const keywordCount = fields.find((f) => f.key === 'keywords')?.count ?? 4;
		const topicCount = fields.find((f) => f.key === 'topics')?.count ?? 3;
		const userMsg = config.userMessage ?? buildMultiFieldUserMessage(keywordCount, topicCount);

		return {
			processChunk: async (chunk) => {
				const langName = LANG_NAMES[viewState.language];
				const res = await chatCompletions({
					...MULTI_FIELD_COMPLETION_OPTIONS,
					...config.completionOptions,
					model: config.model,
					grammar,
					messages: [
						{ role: 'system', content: buildMultiFieldSystemMessage(langName) },
						{ role: 'user', content: `${userMsg}:\n\n${chunk}` }
					]
				});
				return parseMultiFieldResponse(assistantAnswerText(res), fields);
			},
			combineChunks: async (results: MultiChunkData[]): Promise<MultiFinal> => {
				const allKeywords = [
					...new Set(results.flatMap((r) => r.keywords.map((k) => k.trim())))
				].filter(Boolean);
				const allTopics = [
					...new Set(results.flatMap((r) => r.topics.map((t) => t.trim())))
				].filter(Boolean);
				const combinedSummaries = results.map((r) => r.summary.join('\n')).join('\n\n');

				let summary = combinedSummaries;
				if ((config.combineMode ?? 'llm') === 'llm') {
					try {
						const langName = LANG_NAMES[viewState.language];
						const res = await chatCompletions({
							...MULTI_FIELD_COMPLETION_OPTIONS,
							...config.completionOptions,
							model: config.model,
							messages: [
								{ role: 'system', content: buildRecursiveSummarySystemMessage(langName) },
								{
									role: 'user',
									content: `${config.finalUserMessage ?? RECURSIVE_SUMMARY_FINAL_USER_MESSAGE}\n\n${combinedSummaries}`
								}
							]
						});
						summary = assistantAnswerText(res).trim() || combinedSummaries;
					} catch {
						summary = combinedSummaries;
					}
				}

				return { summary, keywords: allKeywords, topics: allTopics };
			}
		};
	}
};
