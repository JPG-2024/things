/**
 * The window-takeaways processor: one plain-text call per window extracts its
 * takeaways and one final, streamed call merges them into the article's
 * takeaways.
 *
 * It mirrors the window-summary processor but runs on demand instead of
 * feeding the persisted analysis. The context-overflow ladder lives in
 * `windowAnalysis` and re-runs this processor with smaller windows.
 */
import { chatCompletions } from '@/lib/utils/inference/chat-completions-provider';
import { assistantAnswerText } from '@/lib/utils/inference/assistant-text';
import { promptState } from '@/stores/promptStore.svelte';
import {
	ANALYSIS_COMPLETION_OPTIONS,
	DEFAULT_DYNAMIC_MODEL
} from '@/lib/utils/inference/constants';
import type {
	CombineOptions,
	TakeawaysChunkData,
	TakeawaysFinal,
	TakeawaysProcessorConfig,
	TakeawaysProcessorDef
} from './types';

function stitchTakeaways(results: TakeawaysChunkData[]): string {
	return results
		.map((result) => result.takeaways.trim())
		.filter(Boolean)
		.join('\n');
}

export const windowTakeawaysProcessor: TakeawaysProcessorDef = {
	type: 'windowTakeaways',
	build: (config: TakeawaysProcessorConfig) => {
		const model = config.model ?? DEFAULT_DYNAMIC_MODEL;
		const completionOptions = {
			...ANALYSIS_COMPLETION_OPTIONS,
			...config.completionOptions,
			model
		};

		/**
		 * Final block of the run: one streamed call over stitched window
		 * takeaways, or over the raw body when the window level is 1.
		 */
		const finalBlock = async (text: string, options?: CombineOptions): Promise<string> => {
			const response = await chatCompletions(
				{
					...completionOptions,
					stream: true,
					messages: [
						{ role: 'system', content: promptState.resolve('takeawaysSystem') },
						{
							role: 'user',
							content: `${promptState.resolve('takeawaysFinalUser')}\n\n${text}`
						}
					]
				},
				{
					signal: options?.signal,
					...(options?.onToken ? { onToken: options.onToken } : {})
				}
			);
			// The streamed text is the answer; the returned one covers a server
			// that answered without streaming.
			return assistantAnswerText(response).trim();
		};

		return {
			processChunk: async (
				chunk: string,
				_index: number,
				options?: { signal?: AbortSignal }
			): Promise<TakeawaysChunkData> => {
				// Read per call, not per build: the prompts are user-editable and a
				// change must reach the next request of an already running pass.
				const system = promptState.resolve('takeawaysSystem');
				const instruction = promptState.resolve('takeawaysWindowUser');
				const response = await chatCompletions(
					{
						...completionOptions,
						stream: false,
						messages: [
							{ role: 'system', content: system },
							{ role: 'user', content: `${instruction}\n\n${chunk}` }
						]
					},
					{ signal: options?.signal }
				);
				return { takeaways: assistantAnswerText(response).trim() };
			},
			combineChunks: async (
				results: TakeawaysChunkData[],
				options?: CombineOptions
			): Promise<{ takeaways: string }> => {
				const stitched = stitchTakeaways(results);
				if (!stitched) return { takeaways: '' };

				try {
					return { takeaways: (await finalBlock(stitched, options)) || stitched };
				} catch (error) {
					// An aborted run must propagate so the caller can stop cleanly;
					// any other failure keeps the partial takeaways on screen.
					if (error instanceof DOMException && error.name === 'AbortError') throw error;
					console.warn('[windowTakeaways] final merge failed, keeping stitched takeaways', error);
					return { takeaways: stitched };
				}
			},
			finalDirect: async (text, options): Promise<TakeawaysFinal> => {
				const takeaways = await finalBlock(text.trim(), options);
				return { takeaways: takeaways || text.trim() };
			}
		};
	}
};
