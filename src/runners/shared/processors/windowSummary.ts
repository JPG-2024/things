import { chatCompletions } from '@/lib/utils/inference/chat-completions-provider';
import { assistantAnswerText } from '@/lib/utils/inference/assistant-text';
import {
	RECURSIVE_SUMMARY_FINAL_USER_MESSAGE,
	RECURSIVE_SUMMARY_USER_MESSAGE,
	buildRecursiveSummarySystemMessage
} from '@/lib/utils/inference/prompts';
import { viewState } from '@/stores/viewStore.svelte';
import { LANG_NAMES } from '@/constants';
import type { ProcessorDef, WindowSummaryChunkData, WindowSummaryFinal } from './types';

/**
 * Simplest windowed analysis: one plain-text summary call per window plus one
 * final combine call over the joined window summaries. No topics, keywords,
 * titles or grammar constraints; the context-overflow ladder in the recursive
 * run loop handles re-chunking transparently.
 */

function langName(): string | undefined {
	return LANG_NAMES[viewState.language];
}

function stitchSummaries(results: WindowSummaryChunkData[]): string {
	return results
		.map((result) => result.summary.trim())
		.filter(Boolean)
		.join('\n\n');
}

export const windowSummaryProcessor: ProcessorDef = {
	type: 'windowSummary',
	defaults: {
		userMessage: RECURSIVE_SUMMARY_USER_MESSAGE,
		finalUserMessage: RECURSIVE_SUMMARY_FINAL_USER_MESSAGE
	},
	emptyFinal: () => ({ summary: '' }),
	build: (config) => {
		const userMessage = config.userMessage ?? RECURSIVE_SUMMARY_USER_MESSAGE;
		const finalUserMessage = config.finalUserMessage ?? RECURSIVE_SUMMARY_FINAL_USER_MESSAGE;

		const summarizeText = async (text: string, final: boolean): Promise<string> => {
			const response = await chatCompletions({
				...config.completionOptions,
				model: config.model,
				stream: false,
				messages: [
					{ role: 'system', content: buildRecursiveSummarySystemMessage(langName()) },
					{
						role: 'user',
						content: final ? `${finalUserMessage}\n\n${text}` : `${userMessage}:\n\n${text}`
					}
				]
			});
			return assistantAnswerText(response).trim();
		};

		return {
			processChunk: async (chunk: string): Promise<WindowSummaryChunkData> => {
				return { summary: await summarizeText(chunk, false) };
			},
			combineChunks: async (results: WindowSummaryChunkData[]): Promise<WindowSummaryFinal> => {
				const combined = stitchSummaries(results);
				if (!combined) return { summary: '' };

				try {
					const summary = await summarizeText(combined, true);
					// An empty answer (censored model, thinking-only close) keeps
					// the stitched window summaries instead of losing the run.
					return { summary: summary || combined };
				} catch (error) {
					console.warn('[windowSummary] final combine failed, keeping stitched summaries', error);
					return { summary: combined };
				}
			}
		};
	}
};
