import { chatCompletions } from '@/lib/utils/inference/chat-completions-provider';
import { SUMMARY_COMPLETION_OPTIONS } from '@/lib/utils/inference/constants';
import type { ProcessorDef } from './types';

export const translateProcessor: ProcessorDef = {
	type: 'translate',
	defaults: {
		userMessage: 'Translate the following text.',
		finalUserMessage: 'Combine these translations into a coherent text.'
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
							content: `Translate to ${lang}. Return only the translation, no explanations.`
						},
						{
							role: 'user',
							content: chunk
						}
					]
				});
				const text = res.choices?.[0]?.message?.content ?? '';
				return typeof text === 'string' ? text.trim() : '';
			},
			combineChunks: async (results) => {
				return results.join('\n\n');
			}
		};
	}
};
