import type { LlamaChatCompletionsRequest } from '@/lib/utils/inference/llama-completions';

export type ProcessorType = 'summarize' | 'extraction' | 'translate' | 'custom';

export type CombineMode = 'llm' | 'join' | 'dedupe';

export interface ChunkProcessorConfig {
	model: string;
	userMessage?: string;
	finalUserMessage?: string;
	extractorConfig?: { count: number; description: string };
	targetLang?: string;
	customSystemMsg?: string;
	completionOptions?: Record<string, unknown>;
	combineMode?: CombineMode;
}

export interface ChunkProcessor {
	processChunk: (chunk: string, index: number) => Promise<string[]>;
	combineChunks: (results: string[], rawChunks: string[]) => Promise<string | string[]>;
}

export interface ProcessorDef {
	type: ProcessorType;
	defaults: Partial<ChunkProcessorConfig>;
	build: (config: ChunkProcessorConfig) => ChunkProcessor;
}
