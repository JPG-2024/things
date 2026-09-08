import { chatCompletions } from '@/lib/utils/inference/chat-completions-provider';
import { MULTI_FIELD_COMPLETION_OPTIONS } from '@/lib/utils/inference/constants';
import {
	MULTI_FIELD_SYSTEM_MESSAGE,
	RECURSIVE_SUMMARY_FINAL_USER_MESSAGE,
	RECURSIVE_SUMMARY_SYSTEM_MESSAGE,
	buildMultiFieldUserMessage
} from '@/lib/utils/inference/prompts';
import { multiFieldObjectGbnf, type MultiFieldSpec } from '@/lib/utils/gbnf';
import type { ProcessorDef, MultiChunkData, MultiFinal } from './types';

const DEFAULT_MULTI_FIELDS: MultiFieldSpec[] = [
	{ key: 'summary', kind: 'string' },
	{ key: 'keywords', kind: 'string-array', count: 4 },
	{ key: 'topics', kind: 'string-array', count: 3 }
];

function parseMultiFieldResponse(content: string, fields: MultiFieldSpec[]): MultiChunkData {
	try {
		const parsed = JSON.parse(content) as Record<string, unknown>;
		const result: MultiChunkData = { summary: [], keywords: [], topics: [] };
		for (const field of fields) {
			const value = parsed[field.key];
			if (field.kind === 'string') {
				result[field.key as 'summary'] = [typeof value === 'string' ? value : ''];
			} else {
				const arr = Array.isArray(value) ? value.map(String) : [];
				result[field.key as 'keywords' | 'topics'] = arr;
			}
		}
		return result;
	} catch {
		console.warn('[multi] Failed to parse LLM response as JSON');
		return { summary: [''], keywords: [], topics: [] };
	}
}

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
				const res = await chatCompletions({
					...MULTI_FIELD_COMPLETION_OPTIONS,
					...config.completionOptions,
					model: config.model,
					grammar,
					messages: [
						{ role: 'system', content: MULTI_FIELD_SYSTEM_MESSAGE },
						{ role: 'user', content: `${userMsg}:\n\n${chunk}` }
					]
				});
				const text = res.choices?.[0]?.message?.content ?? '';
				return parseMultiFieldResponse(typeof text === 'string' ? text : '', fields);
			},
			combineChunks: async (results: MultiChunkData[]) => {
				const multiResults = results as MultiChunkData[];

				const allKeywords = [...new Set(multiResults.flatMap((r) => r.keywords))];
				const allTopics = multiResults.flatMap((r) => r.topics);

				const combinedSummaries = multiResults.map((r) => r.summary.join('\n')).join('\n\n');
				const res = await chatCompletions({
					...MULTI_FIELD_COMPLETION_OPTIONS,
					...config.completionOptions,
					model: config.model,
					messages: [
						{ role: 'system', content: RECURSIVE_SUMMARY_SYSTEM_MESSAGE },
						{
							role: 'user',
							content: `${config.finalUserMessage ?? RECURSIVE_SUMMARY_FINAL_USER_MESSAGE}\n\n${combinedSummaries}`
						}
					]
				});
				const text = res.choices?.[0]?.message?.content ?? '';
				const summary = typeof text === 'string' ? text.trim() : '';

				const finalResult: MultiFinal = {
					summary: summary || combinedSummaries,
					keywords: allKeywords,
					topics: allTopics
				};
				return finalResult;
			}
		};
	}
};
