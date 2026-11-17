/**
 * Processor registry. The article runner has two window analytics: the
 * persisted summary and the on-demand, streamed takeaways.
 */
export { windowSummaryProcessor } from './windowSummary';
export { windowTakeawaysProcessor } from './windowTakeaways';
export type {
	CombineOptions,
	ProcessorDef,
	TakeawaysChunkData,
	TakeawaysFinal,
	TakeawaysProcessor,
	TakeawaysProcessorConfig,
	TakeawaysProcessorDef,
	WindowSummaryChunkData,
	WindowSummaryFinal,
	WindowSummaryProcessor,
	WindowSummaryProcessorConfig,
	WindowSummaryProcessorDef
} from './types';
