import type { LlamaChatCompletionsRequest } from '@/lib/utils/inference/llama-completions';
import type { MultiFieldSpec } from '@/lib/utils/gbnf';

export type ProcessorType =
	| 'summarize'
	| 'extraction'
	| 'translate'
	| 'custom'
	| 'multi'
	| 'analysisTopic'
	| 'windowSummary';

export type CombineMode = 'llm' | 'join' | 'dedupe';

export type MultiChunkData = { summary: string[]; keywords: string[]; topics: string[] };
export type MultiFinal = { summary: string; keywords: string[]; topics: string[] };

export type TopicSection = { topic: string; summary: string };

export type AnalysisTopicChunkData = {
	/**
	 * Heading for the window's summary block, offered by the LLM. Optional:
	 * chunks persisted before the field existed don't carry it, and the
	 * OpenRouter path tolerates models that omit it (empty renders no heading).
	 */
	title?: string;
	/**
	 * One-paragraph summary of the whole window. Optional like `title`; the
	 * final summary falls back to the window's stitched topic summaries.
	 */
	summary?: string;
	topics: string[];
	keywords: string[];
	sections: TopicSection[];
};

export type AnalysisTopicFinal = {
	summary: string;
	keywords: string[];
	topics: string[];
	sections: TopicSection[];
};

/** Minimal windowed chunk result: plain markdown summary of one window. */
export type WindowSummaryChunkData = {
	summary: string;
};

/** Minimal windowed final result: one summary merged from all windows. */
export type WindowSummaryFinal = {
	summary: string;
};

export interface ChunkProcessorConfig {
	model: string;
	userMessage?: string;
	finalUserMessage?: string;
	extractorConfig?: { count: number; description: string };
	targetLang?: string;
	customSystemMsg?: string;
	completionOptions?: Record<string, unknown>;
	combineMode?: CombineMode;
	multiFields?: MultiFieldSpec[];
	localFinal?: boolean;
	topicCount?: number;
	keywordCount?: number;
	topicWordCount?: number;
}

export interface ChunkProcessor {
	processChunk: (chunk: string, index: number) => Promise<string[]>;
	combineChunks: (results: string[], rawChunks: string[]) => Promise<string | string[]>;
}

export interface MultiChunkProcessor {
	processChunk: (chunk: string, index: number) => Promise<MultiChunkData>;
	combineChunks: (results: MultiChunkData[], rawChunks: string[]) => Promise<MultiFinal>;
}

export interface AnalysisTopicChunkProcessor {
	processChunk: (chunk: string, index: number) => Promise<AnalysisTopicChunkData>;
	combineChunks: (
		results: AnalysisTopicChunkData[],
		rawChunks: string[]
	) => Promise<AnalysisTopicFinal>;
}

export interface WindowSummaryChunkProcessor {
	processChunk: (chunk: string, index: number) => Promise<WindowSummaryChunkData>;
	combineChunks: (
		results: WindowSummaryChunkData[],
		rawChunks: string[]
	) => Promise<WindowSummaryFinal>;
}

export type AnyChunkProcessor =
	| ChunkProcessor
	| MultiChunkProcessor
	| AnalysisTopicChunkProcessor
	| WindowSummaryChunkProcessor;

export interface ProcessorDef {
	type: ProcessorType;
	defaults: Partial<ChunkProcessorConfig>;
	/**
	 * Empty final-result placeholder the run loop writes into task data while
	 * chunks are still streaming. Windowed processors with object finals
	 * supply it; plain-text processors fall back to `''`. Its presence also
	 * marks the processor's combined shape as object-windowed for dispatch.
	 */
	emptyFinal?: () => unknown;
	build: (config: ChunkProcessorConfig) => AnyChunkProcessor;
}
