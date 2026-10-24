/**
 * Processor registry. The MVP article runner has exactly one analytic, so the
 * registry holds one entry.
 */
export { windowSummaryProcessor } from './windowSummary';
export type {
	ProcessorDef,
	WindowSummaryChunkData,
	WindowSummaryFinal,
	WindowSummaryProcessor,
	WindowSummaryProcessorConfig
} from './types';
