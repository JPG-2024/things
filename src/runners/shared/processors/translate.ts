import { chatCompletions } from '@/lib/utils/inference/chat-completions-provider';
import { SUMMARY_COMPLETION_OPTIONS } from '@/lib/utils/inference/constants';
import {
	TRANSLATE_FINAL_USER_MESSAGE,
	TRANSLATE_USER_MESSAGE,
	buildTranslateSystemMessage
} from '@/lib/utils/inference/prompts';
import { combineResults } from './combineHelpers';
import type { ProcessorDef } from './types';

export const translateProcessor: ProcessorDef = {
	type: 'translate',
	defaults: {
		userMessage: TRANSLATE_USER_MESSAGE,
		finalUserMessage: TRANSLATE_FINAL_USER_MESSAGE
	},
	build: (config) => {
		const lang = config.targetLang ?? 'Spanish';

		return {
			processChunk: async (chunk) => {
				const res = await chatCompletions({
					...SUMMARY_COMPLETION_OPTIONS,
					model: config.model,
					stream: false,
					messages: [
						{
							role: 'system',
							content: buildTranslateSystemMessage(lang)
						},
						{
							role: 'user',
							content: chunk
						}
					]
				});
				const text = res.choices?.[0]?.message?.content ?? '';
				return [typeof text === 'string' ? text.trim() : ''];
			},
			combineChunks: async (results) => {
				if (config.combineMode && config.combineMode !== 'llm') {
					return combineResults(results, { mode: config.combineMode });
				}
				return results.join('\n\n');
			}
		};
	}
};
