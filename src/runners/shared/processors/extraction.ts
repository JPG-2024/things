import { extractionHelper } from '@/lib/utils/inference/extraction-helper';
import { chatCompletions } from '@/lib/utils/inference/chat-completions-provider';
import { parseStructuredArrayResponses } from '@/lib/utils/helpers/tasks';
import {
	buildExtractionCompletionOptions,
	buildExtractionSystemMessage
} from '@/lib/utils/inference/extraction-helper';
import type { ProcessorDef } from './types';

export const extractionProcessor: ProcessorDef = {
	type: 'extraction',
	defaults: {
		userMessage: 'Extract items from this content.',
		finalUserMessage:
			'From this list of extracted items, pick the most relevant ones. Return a JSON array.'
	},
	build: (config) => {
		const count = config.extractorConfig?.count ?? 3;
		const description = config.extractorConfig?.description ?? 'keywords';

		return {
			processChunk: async (chunk) => {
				return await extractionHelper(chunk, count, description, {
					model: config.model
				});
			},
			combineChunks: async (results) => {
				if (config.combineMode && config.combineMode !== 'llm') {
					if (config.combineMode === 'dedupe') {
						return [...new Set(results)];
					}
					return results;
				}
				const unique = [...new Set(results)];
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
