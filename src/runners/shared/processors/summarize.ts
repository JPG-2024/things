import { chatCompletions } from '@/lib/utils/inference/chat-completions-provider';
import { SUMMARY_COMPLETION_OPTIONS } from '@/lib/utils/inference/constants';
import {
	RECURSIVE_SUMMARY_FINAL_USER_MESSAGE,
	RECURSIVE_SUMMARY_SYSTEM_MESSAGE,
	RECURSIVE_SUMMARY_USER_MESSAGE
} from '@/lib/utils/inference/prompts';
import { combineResults } from './combineHelpers';
import type { ProcessorDef } from './types';

export const summarizeProcessor: ProcessorDef = {
	type: 'summarize',
	defaults: {
		userMessage: RECURSIVE_SUMMARY_USER_MESSAGE,
		finalUserMessage: RECURSIVE_SUMMARY_FINAL_USER_MESSAGE
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
						content: RECURSIVE_SUMMARY_SYSTEM_MESSAGE
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
		combineChunks: async (results: string[]) => {
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
						content: RECURSIVE_SUMMARY_SYSTEM_MESSAGE
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
