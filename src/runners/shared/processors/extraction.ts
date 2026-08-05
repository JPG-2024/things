import { extractionHelper } from '@/lib/utils/inference/extraction-helper';
import { chatCompletions } from '@/lib/utils/inference/chat-completions-provider';
import { parseStructuredArrayResponses } from '@/lib/utils/helpers/tasks';
import {
	buildExtractionCompletionOptions,
	buildExtractionSystemMessage,
	buildExtractionUserMessage
} from '@/lib/utils/inference/extraction-helper';
import { combineResults, parseAndFlattenJsonArrays } from './combineHelpers';
import type { ProcessorDef } from './types';

export const extractionProcessor: ProcessorDef = {
	type: 'extraction',
	defaults: {
		userMessage: 'Extract items from this content.',
		finalUserMessage: 'From this list of extracted items, pick the most relevant ones. Return a JSON array.'
	},
	build: (config) => {
		const count = config.extractorConfig?.count ?? 3;
		const description = config.extractorConfig?.description ?? 'keywords';

		return {
			processChunk: async (chunk) => {
				const extracted = await extractionHelper(chunk, count, description, {
					model: config.model
				});
				return JSON.stringify(extracted);
			},
		combineChunks: async (results) => {
			if (config.combineMode && config.combineMode !== 'llm') {
				const flat = parseAndFlattenJsonArrays(results);
				if (config.combineMode === 'dedupe') {
					return [...new Set(flat)];
				}
				return flat;
			}
			const allExtractions: string[] = [];
				for (const r of results) {
					try {
						const parsed = JSON.parse(r);
						if (Array.isArray(parsed)) allExtractions.push(...parsed);
					} catch {
						allExtractions.push(r);
					}
				}
				const unique = [...new Set(allExtractions)];
				const combined = unique.join(', ');

				const res = await chatCompletions({
					...buildExtractionCompletionOptions(count, config.model),
					model: config.model,
					stream: false,
					messages: [
						{
							role: 'system',
							content: buildExtractionSystemMessage(count, description)
						},
						{
							role: 'user',
							content: `${config.finalUserMessage}\n\n${combined}`
						}
					]
				});
				const text = res.choices?.[0]?.message?.content ?? '';
				const contentStr = typeof text === 'string' ? text : '';
				return parseStructuredArrayResponses(contentStr);
			}
		};
	}
};
