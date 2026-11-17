/**
 * Contracts of the window processors of the article runner: the summary
 * (the persisted analytic) and the takeaways (on-demand, streamed).
 */

/** Result of summarizing one window. */
export interface WindowSummaryChunkData {
	summary: string;
	/** Two questions the window answers; absent when the questions call failed. */
	questions?: string[];
	/** Short label of the window summary; absent when the title call failed. */
	title?: string;
}

/** Result of merging every window summary. */
export interface WindowSummaryFinal {
	summary: string;
}

/** Configuration of the window-summary processor. */
export interface WindowSummaryProcessorConfig {
	/** Model to use for the summarization calls. */
	model?: string;
	/**
	 * Ask each window for the questions it answers (one extra call per
	 * window). Defaults to `true`.
	 */
	questions?: boolean;
	/** Extra completion options merged into every call. */
	completionOptions?: Record<string, unknown>;
}

/** The window-summary processor. */
export interface WindowSummaryProcessor {
	/** Summarizes one window. */
	processChunk: (chunk: string, index: number) => Promise<WindowSummaryChunkData>;
	/** Merges the window summaries into one summary. */
	combineChunks: (results: WindowSummaryChunkData[]) => Promise<WindowSummaryFinal>;
	/** Final block straight from the raw body, without a window merge (level 1). */
	finalDirect: (text: string, options?: CombineOptions) => Promise<WindowSummaryFinal>;
}

/** Result of extracting the takeaways of one window. */
export interface TakeawaysChunkData {
	takeaways: string;
}

/** Result of merging every window's takeaways. */
export interface TakeawaysFinal {
	takeaways: string;
}

/** Configuration of the window-takeaways processor. */
export interface TakeawaysProcessorConfig {
	/** Model to use for the takeaway calls. */
	model?: string;
	/** Extra completion options merged into every call. */
	completionOptions?: Record<string, unknown>;
}

/** Options that apply to one merge call. */
export interface CombineOptions {
	signal?: AbortSignal;
	/** Receives each token of the final, streamed call. */
	onToken?: (token: string) => void;
}

/** The window-takeaways processor. */
export interface TakeawaysProcessor {
	/** Extracts the takeaways of one window. */
	processChunk: (
		chunk: string,
		index: number,
		options?: { signal?: AbortSignal }
	) => Promise<TakeawaysChunkData>;
	/** Merges the partial takeaways; the final call streams its answer. */
	combineChunks: (
		results: TakeawaysChunkData[],
		options?: CombineOptions
	) => Promise<TakeawaysFinal>;
	/** Final block straight from the raw body, without a window merge (level 1). */
	finalDirect: (text: string, options?: CombineOptions) => Promise<TakeawaysFinal>;
}

/** Definition of a processor: its type tag and how to build it. */
export type ProcessorDef = WindowSummaryProcessorDef | TakeawaysProcessorDef;

export interface WindowSummaryProcessorDef {
	type: 'windowSummary';
	build: (config: WindowSummaryProcessorConfig) => WindowSummaryProcessor;
}

export interface TakeawaysProcessorDef {
	type: 'windowTakeaways';
	build: (config: TakeawaysProcessorConfig) => TakeawaysProcessor;
}
