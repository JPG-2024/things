import type { LlamaChatCompletionsRequest } from '@/lib/utils/inference/llama-completions';
import type { MultiFieldSpec } from '@/lib/utils/gbnf';

export type ProcessorType =
	| 'summarize'
	| 'extraction'
	| 'translate'
	| 'custom'
	| 'multi'
	| 'analysisTopic';

export type CombineMode = 'llm' | 'join' | 'dedupe';

export type MultiChunkData = { summary: string[]; keywords: string[]; topics: string[] };
export type MultiFinal = { summary: string; keywords: string[]; topics: string[] };

export type TopicSection = { topic: string; summary: string };

export type AnalysisTopicChunkData = {
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

export type AnyChunkProcessor = ChunkProcessor | MultiChunkProcessor | AnalysisTopicChunkProcessor;

export interface ProcessorDef {
	type: ProcessorType;
	defaults: Partial<ChunkProcessorConfig>;
	build: (config: ChunkProcessorConfig) => AnyChunkProcessor;
}
