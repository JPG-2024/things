import { chatCompletions } from '@/lib/utils/inference/chat-completions-provider';
import { SUMMARY_COMPLETION_OPTIONS } from '@/lib/utils/inference/constants';
import {
	CUSTOM_FINAL_USER_MESSAGE,
	CUSTOM_SYSTEM_MESSAGE,
	CUSTOM_USER_MESSAGE
} from '@/lib/utils/inference/prompts';
import { combineResults } from './combineHelpers';
import type { ProcessorDef } from './types';

export const customProcessor: ProcessorDef = {
	type: 'custom',
	defaults: {
		customSystemMsg: CUSTOM_SYSTEM_MESSAGE,
		userMessage: CUSTOM_USER_MESSAGE,
		finalUserMessage: CUSTOM_FINAL_USER_MESSAGE
	},
	build: (config) => ({
		processChunk: async (chunk) => {
			const res = await chatCompletions({
				...SUMMARY_COMPLETION_OPTIONS,
				model: config.model,
				stream: false,
				messages: [
					{
						role: 'system',
						content: config.customSystemMsg ?? CUSTOM_SYSTEM_MESSAGE
					},
					{
						role: 'user',
						content: `${config.userMessage}:\n\n${chunk}`
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
			const combined = results.join('\n\n');
			const res = await chatCompletions({
				...SUMMARY_COMPLETION_OPTIONS,
				model: config.model,
				stream: false,
				messages: [
					{
						role: 'system',
						content: config.customSystemMsg ?? CUSTOM_SYSTEM_MESSAGE
					},
					{
						role: 'user',
						content: `${config.finalUserMessage}\n\n${combined}`
					}
				]
			});
			const text = res.choices?.[0]?.message?.content ?? '';
			return typeof text === 'string' ? text.trim() : '';
		}
	})
};
