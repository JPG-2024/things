import { chatCompletions } from '@/lib/utils/inference/chat-completions-provider';
import { SUMMARY_COMPLETION_OPTIONS } from '@/lib/utils/inference/constants';
import type { ProcessorDef } from './types';

export const summarizeProcessor: ProcessorDef = {
	type: 'summarize',
	defaults: {
		userMessage: 'Summarize this section concisely, only summary. no titles',
		finalUserMessage: 'Combine these section summaries into one coherent summary. no title.'
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
						content: 'You are a professional content summarizer. Write a concise and clear summary, only summary. no titles'
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
			const combined = results.join('\n\n');
			const res = await chatCompletions({
				...SUMMARY_COMPLETION_OPTIONS,
				model: config.model,
				stream: false,
				messages: [
					{
						role: 'system',
						content: 'You are a professional content summarizer. Write a concise and clear summary, only summary. no titles'
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
