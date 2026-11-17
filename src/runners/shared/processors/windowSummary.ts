/**
 * The window-summary processor: one plain-text summary call per window
 * (plus a short title call for the card label) and one final merge call over
 * the joined window summaries.
 *
 * No topics, keywords or grammar constraints: the summary and its label are
 * the only analytics of the MVP runner. The context-overflow ladder lives in
 * `windowAnalysis` and re-runs this processor with smaller windows.
 */
import { chatCompletions } from '@/lib/utils/inference/chat-completions-provider';
import { assistantAnswerText } from '@/lib/utils/inference/assistant-text';
import { parseQuestionsResponse, parseTitleText } from '@/lib/utils/inference/finalResponse';
import {
	TITLE_SYSTEM_MESSAGE,
	buildWindowTitleUserMessage,
	buildWindowQuestionsUserMessage
} from '@/lib/utils/inference/prompts';
import { windowQuestionsSchema } from '@/lib/utils/schemas/structuredSchemas';
import { questionsForChunk } from '@/lib/utils/windowQuestions';
import { promptState } from '@/stores/promptStore.svelte';
import {
	ANALYSIS_COMPLETION_OPTIONS,
	DEFAULT_DYNAMIC_MODEL,
	DEFAULT_TITLE_COMPLETION_OPTIONS
} from '@/lib/utils/inference/constants';
import type {
	WindowSummaryChunkData,
	WindowSummaryFinal,
	WindowSummaryProcessorConfig,
	WindowSummaryProcessorDef
} from './types';

function stitchSummaries(results: WindowSummaryChunkData[]): string {
	return results
		.map((result) => result.summary.trim())
		.filter(Boolean)
		.join('\n\n');
}

export const windowSummaryProcessor: WindowSummaryProcessorDef = {
	type: 'windowSummary',
	build: (config: WindowSummaryProcessorConfig) => {
		const model = config.model ?? DEFAULT_DYNAMIC_MODEL;
		// One extra call per window: the user can turn it off and keep only the
		// summary and its label.
		const includeQuestions = config.questions !== false;
		const completionOptions = {
			...ANALYSIS_COMPLETION_OPTIONS,
			...config.completionOptions,
			model
		};

		const summarizeText = async (text: string): Promise<string> => {
			// Read per call, not per build: the prompts are user-editable and a
			// change must reach the next request of an already running analysis.
			const response = await chatCompletions({
				...completionOptions,
				stream: false,
				messages: [
					{ role: 'system', content: promptState.resolve('windowSystem') },
					{
						role: 'user',
						// No glue text: the editor shows the instruction as a whole,
						// so what the model gets must read the same way.
						content: `${promptState.resolve('windowUser')}\n\n${text}`
					}
				]
			});
			return assistantAnswerText(response).trim();
		};

		/**
		 * Final block of the run: one call over stitched window summaries, or
		 * over the raw body when the window level is 1 (no merge). The prompt
		 * works for both inputs and streams when a listener is attached.
		 */
		const finalBlock = async (
			text: string,
			options?: { signal?: AbortSignal; onToken?: (token: string) => void }
		): Promise<string> => {
			const response = await chatCompletions(
				{
					...completionOptions,
					stream: false,
					messages: [
						{ role: 'system', content: promptState.resolve('windowSystem') },
						{
							role: 'user',
							content: `${promptState.resolve('finalUser')}\n\n${text}`
						}
					]
				},
				{
					signal: options?.signal,
					...(options?.onToken ? { onToken: options.onToken } : {})
				}
			);
			return assistantAnswerText(response).trim();
		};

		/**
		 * Short label for one window summary, sized for a card heading.
		 *
		 * The summary travels as `context` (prepended by the provider, never
		 * sent as-is), and a failure only loses the label: the window summary
		 * it describes is already done.
		 */
		const summarizeTitle = async (summary: string): Promise<string | null> => {
			if (!summary.trim()) return null;

			try {
				const response = await chatCompletions({
					...DEFAULT_TITLE_COMPLETION_OPTIONS,
					model,
					n_predict: 64,
					stream: false,
					context: summary,
					messages: [
						{ role: 'system', content: TITLE_SYSTEM_MESSAGE },
						{ role: 'user', content: buildWindowTitleUserMessage() }
					]
				});
				return parseTitleText(assistantAnswerText(response)).trim() || null;
			} catch (error) {
				console.warn('[windowSummary] window title failed', error);
				return null;
			}
		};

		/**
		 * Questions the window answers, as structured output.
		 *
		 * The count scales with the window size (a bigger window answers
		 * more), and the schema travels as `response_format`, which every
		 * provider receives (llama turns it into a grammar; the
		 * OpenAI-compatible adapters forward it untouched). A failure only
		 * loses the questions: the window summary it enriches is already
		 * done.
		 */
		const extractQuestions = async (text: string): Promise<string[]> => {
			if (!text.trim()) return [];

			const count = questionsForChunk(text);
			try {
				const response = await chatCompletions({
					...completionOptions,
					stream: false,
					response_format: windowQuestionsSchema(count),
					messages: [
						{
							role: 'user',
							content: `${buildWindowQuestionsUserMessage(count)}\n\n${text}`
						}
					]
				});
				return parseQuestionsResponse(assistantAnswerText(response), count) ?? [];
			} catch (error) {
				console.warn('[windowSummary] window questions failed', error);
				return [];
			}
		};

		return {
			processChunk: async (chunk: string): Promise<WindowSummaryChunkData> => {
				const summary = await summarizeText(chunk);
				// Sequential on purpose: the local llama-server is single
				// threaded, so parallel calls would just queue.
				const questions = includeQuestions ? await extractQuestions(chunk) : [];
				const title = await summarizeTitle(summary);
				return {
					summary,
					...(questions.length ? { questions } : {}),
					...(title ? { title } : {})
				};
			},
			combineChunks: async (results: WindowSummaryChunkData[]): Promise<WindowSummaryFinal> => {
				const combined = stitchSummaries(results);
				if (!combined) return { summary: '' };

				try {
					const summary = await finalBlock(combined);
					// An empty answer (censored model, thinking-only close) keeps
					// the stitched window summaries instead of losing the run.
					return { summary: summary || combined };
				} catch (error) {
					console.warn('[windowSummary] final combine failed, keeping stitched summaries', error);
					return { summary: combined };
				}
			},
			finalDirect: async (text, options): Promise<WindowSummaryFinal> => {
				const summary = await finalBlock(text.trim(), options);
				// Keep the body as the last resort: the run must still produce a
				// final block when the model answers nothing.
				return { summary: summary || text.trim() };
			}
		};
	}
};
