import { z } from 'zod';
import { buildScriptTaskFromDef, requireStringState, scriptTask } from '@/runners/taskSchema';
import { DEFAULT_DYNAMIC_MODEL, SUMMARY_COMPLETION_OPTIONS } from '@/lib/utils/inference/constants';
import { splitByLevels, splitByString, splitForEmbeddings } from '@/lib/utils/splitText';
import { getProcessor } from '@/runners/shared/processors';
import type { CombineMode, ProcessorType } from '@/runners/shared/processors';
import type {
	ExtractorConfig,
	Resolvable,
	Task,
	TaskComponentProps,
	TaskDefCtx
} from '@/types/taskRunner.types';

export type ChunkOffset = {
	startOffset: number;
	endOffset: number;
};

export type RecursiveChunk = {
	key: ChunkOffset;
	data: string[];
};

export type RecursiveContentResult = {
	chunks: RecursiveChunk[];
	finalResponse: string | string[];
};

export interface RecursiveConfig {
	windowSize: number;
	overlap: number;
	windowDivisor?: number;
	splitByString?: string;
	processorType: ProcessorType;
	combineMode?: CombineMode;
	userMessage: string;
	finalUserMessage: string;
	extractorConfig?: ExtractorConfig;
	targetLang?: string;
	customSystemMsg?: string;
}

export type RecursiveTaskOptions = Partial<RecursiveConfig> & {
	name?: string;
	dependencies?: string[];
	component?: string;
	componentProps?: Resolvable<TaskComponentProps>;
	gridSpan?: 1 | 2;
	renderOrder?: number;
	persist?: boolean;
	enableTTS?: boolean;
	embeddings?: boolean;
	model?: string;
	completionOptions?: Record<string, unknown>;
};

type Chunking = Pick<RecursiveConfig, 'windowSize' | 'overlap' | 'windowDivisor' | 'splitByString'>;

const RECURSIVE_OUTPUT_SCHEMA = z.object({
	chunks: z.array(
		z.object({
			key: z.object({ startOffset: z.number(), endOffset: z.number() }),
			data: z.array(z.string())
		})
	),
	finalResponse: z.union([z.string(), z.array(z.string())])
});

function resolveChunking(options: Partial<RecursiveConfig>): Chunking {
	const windowSize = options.windowSize ?? 1000;
	const overlap = options.overlap ?? Math.floor(windowSize * 0.1);
	const windowDivisor = options.splitByString
		? undefined
		: options.windowDivisor !== undefined
			? options.windowDivisor
			: options.windowSize !== undefined || options.overlap !== undefined
				? undefined
				: 2;
	return {
		windowSize,
		overlap,
		windowDivisor,
		splitByString: options.splitByString
	};
}

function splitContent(content: string, chunking: Chunking) {
	if (chunking.splitByString) return splitByString(content, chunking.splitByString);
	if (chunking.windowDivisor) return splitByLevels(content, chunking.windowDivisor);
	return splitForEmbeddings(content, {
		windowSize: chunking.windowSize,
		overlap: chunking.overlap
	});
}

function resolveModel(options: RecursiveTaskOptions): string {
	const completionModel = options.completionOptions?.model;
	return (
		options.model ??
		(typeof completionModel === 'string' ? completionModel : undefined) ??
		DEFAULT_DYNAMIC_MODEL
	);
}

function mergeComponentProps(
	componentProps: Resolvable<TaskComponentProps> | undefined,
	recursiveConfig: RecursiveConfig
): Resolvable<TaskComponentProps> {
	const withConfig = (props: TaskComponentProps) => ({ ...props, recursiveConfig });
	return typeof componentProps === 'function'
		? (ctx: TaskDefCtx) => withConfig(componentProps(ctx))
		: withConfig(componentProps ?? {});
}

export function buildRecursiveTask(id: string, options: RecursiveTaskOptions): Task {
	const model = resolveModel(options);
	const chunking = resolveChunking(options);
	const processorType: ProcessorType =
		options.processorType ?? (options.extractorConfig ? 'extraction' : 'summarize');
	const processorDef = getProcessor(processorType);
	const userMessage = options.userMessage ?? processorDef.defaults.userMessage ?? '';
	const finalUserMessage = options.finalUserMessage ?? processorDef.defaults.finalUserMessage ?? '';
	const sourceDependency = options.dependencies?.[0] ?? 'content';

	const processor = processorDef.build({
		model,
		userMessage,
		finalUserMessage,
		extractorConfig: options.extractorConfig,
		targetLang: options.targetLang,
		customSystemMsg: options.customSystemMsg,
		completionOptions: options.completionOptions ?? { ...SUMMARY_COMPLETION_OPTIONS, model },
		combineMode: options.combineMode
	});

	const recursiveConfig: RecursiveConfig = {
		windowSize: chunking.windowSize,
		overlap: chunking.overlap,
		windowDivisor: chunking.windowDivisor,
		splitByString: chunking.splitByString,
		processorType,
		combineMode: options.combineMode,
		userMessage,
		finalUserMessage,
		extractorConfig: options.extractorConfig,
		targetLang: options.targetLang,
		customSystemMsg: options.customSystemMsg
	};

	return buildScriptTaskFromDef(
		id,
		scriptTask({
			name: options.name,
			subtype: 'recursive',
			dependencies: options.dependencies ?? ['content'],
			component: options.component ?? 'recursive',
			componentProps: mergeComponentProps(options.componentProps, recursiveConfig),
			gridSpan: options.gridSpan,
			renderOrder: options.renderOrder,
			persist: options.persist,
			enableTTS: options.enableTTS,
			embeddings: options.embeddings,
			concurrencyGroup: 'recursive',
			output: RECURSIVE_OUTPUT_SCHEMA,
			run: async ({ state, update }) => {
				const content = requireStringState(state, sourceDependency);
				const chunksResult = splitContent(content, chunking);
				const sections = chunksResult.map((c) => c.text);
				const chunkOffsets = chunksResult.map((c) => ({
					startOffset: c.startOffset,
					endOffset: c.endOffset
				}));

				const chunks: RecursiveChunk[] = [];

				for (let i = 0; i < sections.length; i++) {
					const result = await processor.processChunk(sections[i], i);
					chunks.push({ key: chunkOffsets[i], data: result });
					update({
						data: { chunks: [...chunks], finalResponse: '' }
					});
				}

				const finalResponse = await processor.combineChunks(
					chunks.flatMap((c) => c.data),
					sections
				);

				return { chunks, finalResponse };
			}
		})
	);
}

export function recursiveConfigFromTask(task: Task): RecursiveConfig | undefined {
	const props = task.componentProps as { recursiveConfig?: RecursiveConfig } | undefined;
	return props?.recursiveConfig;
}
