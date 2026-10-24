/**
 * Contract of the window-summary processor — the only processor left in the
 * MVP article runner.
 */

/** Result of summarizing one window. */
export interface WindowSummaryChunkData {
	summary: string;
}

/** Result of merging every window summary. */
export interface WindowSummaryFinal {
	summary: string;
}

/** Configuration of the window-summary processor. */
export interface WindowSummaryProcessorConfig {
	/** Model to use for the summarization calls. */
	model?: string;
	/** Language the summaries are written in. */
	languageName?: string;
	/** Extra completion options merged into every call. */
	completionOptions?: Record<string, unknown>;
}

/** The processor itself. */
export interface WindowSummaryProcessor {
	/** Summarizes one window. */
	processChunk: (chunk: string, index: number) => Promise<WindowSummaryChunkData>;
	/** Merges the window summaries into one summary. */
	combineChunks: (results: WindowSummaryChunkData[]) => Promise<WindowSummaryFinal>;
}

/** Definition of a processor: its type tag and how to build it. */
export interface ProcessorDef {
	type: 'windowSummary';
	build: (config: WindowSummaryProcessorConfig) => WindowSummaryProcessor;
}
