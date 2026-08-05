import { chatCompletions } from '@/lib/utils/inference/chat-completions-provider';
import { SUMMARY_COMPLETION_OPTIONS } from '@/lib/utils/inference/constants';
import { combineResults } from './combineHelpers';
import type { ProcessorDef } from './types';

export const customProcessor: ProcessorDef = {
	type: 'custom',
	defaults: {
		customSystemMsg: 'You are a helpful AI assistant.',
		userMessage: 'Process this content.',
		finalUserMessage: 'Combine the results into a coherent response.'
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
						content: config.customSystemMsg ?? 'You are a helpful AI assistant.'
					},
					{
						role: 'user',
						content: `${config.userMessage}:\n\n${chunk}`
					}
				]
			});
			const text = res.choices?.[0]?.message?.content ?? '';
			return typeof text === 'string' ? text.trim() : '';
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
						content: config.customSystemMsg ?? 'You are a helpful AI assistant.'
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
