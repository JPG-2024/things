/**
 * The window-summary processor: one plain-text summary call per window plus
 * one final merge call over the joined window summaries.
 *
 * No topics, keywords, titles or grammar constraints: the window summary is
 * the only analytic of the MVP runner. The context-overflow ladder lives in
 * `windowAnalysis` and re-runs this processor with smaller windows.
 */
import { chatCompletions } from '@/lib/utils/inference/chat-completions-provider';
import { assistantAnswerText } from '@/lib/utils/inference/assistant-text';
import {
	RECURSIVE_SUMMARY_FINAL_USER_MESSAGE,
	RECURSIVE_SUMMARY_USER_MESSAGE,
	buildRecursiveSummarySystemMessage
} from '@/lib/utils/inference/prompts';
import {
	ANALYSIS_COMPLETION_OPTIONS,
	DEFAULT_DYNAMIC_MODEL
} from '@/lib/utils/inference/constants';
import type {
	ProcessorDef,
	WindowSummaryChunkData,
	WindowSummaryFinal,
	WindowSummaryProcessorConfig
} from './types';

function stitchSummaries(results: WindowSummaryChunkData[]): string {
	return results
		.map((result) => result.summary.trim())
		.filter(Boolean)
		.join('\n\n');
}

export const windowSummaryProcessor: ProcessorDef = {
	type: 'windowSummary',
	build: (config: WindowSummaryProcessorConfig) => {
		const model = config.model ?? DEFAULT_DYNAMIC_MODEL;
		const completionOptions = {
			...ANALYSIS_COMPLETION_OPTIONS,
			...config.completionOptions,
			model
		};

		const summarizeText = async (text: string, final: boolean): Promise<string> => {
			const response = await chatCompletions({
				...completionOptions,
				stream: false,
				messages: [
					{
						role: 'system',
						content: buildRecursiveSummarySystemMessage(config.languageName)
					},
					{
						role: 'user',
						content: final
							? `${RECURSIVE_SUMMARY_FINAL_USER_MESSAGE}\n\n${text}`
							: `${RECURSIVE_SUMMARY_USER_MESSAGE}:\n\n${text}`
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
