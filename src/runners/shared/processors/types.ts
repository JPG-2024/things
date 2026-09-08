import type { LlamaChatCompletionsRequest } from '@/lib/utils/inference/llama-completions';
import type { MultiFieldSpec } from '@/lib/utils/gbnf';

export type ProcessorType = 'summarize' | 'extraction' | 'translate' | 'custom' | 'multi';

export type CombineMode = 'llm' | 'join' | 'dedupe';

export type MultiChunkData = { summary: string[]; keywords: string[]; topics: string[] };
export type MultiFinal = { summary: string; keywords: string[]; topics: string[] };

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
}

export interface ChunkProcessor {
	processChunk: (chunk: string, index: number) => Promise<string[]>;
	combineChunks: (results: string[], rawChunks: string[]) => Promise<string | string[]>;
}

export interface MultiChunkProcessor {
	processChunk: (chunk: string, index: number) => Promise<MultiChunkData>;
	combineChunks: (results: MultiChunkData[], rawChunks: string[]) => Promise<MultiFinal>;
}

export type AnyChunkProcessor = ChunkProcessor | MultiChunkProcessor;

export interface ProcessorDef {
	type: ProcessorType;
	defaults: Partial<ChunkProcessorConfig>;
	build: (config: ChunkProcessorConfig) => AnyChunkProcessor;
}
