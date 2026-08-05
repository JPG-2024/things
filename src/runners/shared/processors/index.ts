import type { ProcessorDef, ProcessorType } from './types';
import { summarizeProcessor } from './summarize';
import { extractionProcessor } from './extraction';
import { translateProcessor } from './translate';
import { customProcessor } from './custom';

const registry = new Map<ProcessorType, ProcessorDef>();

function register(def: ProcessorDef): void {
	registry.set(def.type, def);
}

register(summarizeProcessor);
register(extractionProcessor);
register(translateProcessor);
register(customProcessor);

export function getProcessor(type: ProcessorType): ProcessorDef {
	const def = registry.get(type);
	if (!def) throw new Error(`Unknown processor type: ${type}`);
	return def;
}

export function getProcessorTypes(): ProcessorType[] {
	return [...registry.keys()];
}

export type { ProcessorDef, ProcessorType, ChunkProcessorConfig, ChunkProcessor } from './types';
