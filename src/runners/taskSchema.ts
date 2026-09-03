import type { z } from 'zod';
import type {
	ExtractorConfig,
	IaTask,
	IaTaskSubtype,
	Resolvable,
	ScriptTask,
	Task,
	TaskDefCtx,
	TaskGlobalState,
	TaskMapBase,
	TaskRuntime,
	TaskStatusUpdater
} from '@/types/taskRunner.types';

export type { Resolvable, TaskDefCtx } from '@/types/taskRunner.types';

type AnyZodOutput = z.core.$ZodType;

type TaskDefBase<TOutput extends AnyZodOutput, TContext> = {
	name?: string;
	subtype?: IaTaskSubtype;
	dependencies?: string[];
	component?: string;
	componentProps?: Resolvable<Record<string, unknown>, TContext>;
	gridSpan?: 1 | 2;
	renderOrder?: number;
	persist?: boolean;
	enableTTS?: boolean;
	output: TOutput;
	concurrencyGroup?: string;
	embeddings?: boolean;
};

type ScriptTaskDefBase<TOutput extends AnyZodOutput, TContext> = Omit<
	TaskDefBase<TOutput, TContext>,
	'output'
> & {
	output: TOutput;
	run: (ctx: TaskRunContext<TContext, Record<string, unknown>>) => unknown | Promise<unknown>;
};

export type TaskDefCompleteParams<TContext = unknown> = {
	result: unknown;
	runResult: string;
	context: TContext;
	state: Readonly<Record<string, unknown>>;
};

type IaTaskDefBase<TOutput extends AnyZodOutput, TContext, TParsed = z.infer<TOutput>> = Omit<
	TaskDefBase<TOutput, TContext>,
	'output'
> & {
	output: TOutput;
	systemMessage: Resolvable<string, TContext>;
	userMessage: Resolvable<string, TContext>;
	completionOptions: Resolvable<Record<string, unknown>, TContext>;
	baseUrl?: string;
	extractorConfig?: ExtractorConfig;
	categoryNames?: string[];
	directResult?: (
		ctx: TaskRunContext<TContext, Record<string, unknown>>
	) => TParsed | Promise<TParsed> | null;
	run?: (ctx: TaskRunContext<TContext, Record<string, unknown>>) => string | Promise<string>;
	resultParser?: (text: string, ctx: TaskDefCtx<TContext>) => TParsed | Promise<TParsed>;
	onComplete?: (params: TaskDefCompleteParams<TContext>) => void | Promise<void>;
};

export type ScriptTaskDef<
	TOutput extends AnyZodOutput = AnyZodOutput,
	TContext = unknown
> = ScriptTaskDefBase<TOutput, TContext> & { type: 'script' };

export type IaTaskDef<
	TOutput extends AnyZodOutput = AnyZodOutput,
	TContext = unknown,
	TParsed = z.infer<TOutput>
> = IaTaskDefBase<TOutput, TContext, TParsed> & { type: 'ia' };

type AnyTaskDef<TContext = unknown> =
	| ScriptTaskDef<AnyZodOutput, TContext>
	| IaTaskDef<AnyZodOutput, TContext>;

export type TaskRunContext<TContext, TState> = {
	runId: string;
	taskId: string;
	state: Readonly<TState>;
	context: TContext;
	update: TaskStatusUpdater;
	enqueueTasks: (tasks: Task<TaskMapBase>[], options?: { restart?: boolean }) => void;
};

export type InferTaskMap<TDefs extends Record<string, AnyTaskDef>> = {
	[K in keyof TDefs]: TDefs[K] extends IaTaskDefBase<infer TOutput, infer TContext, infer TParsed>
		? TParsed
		: TDefs[K]['output'] extends AnyZodOutput
			? z.infer<TDefs[K]['output']>
			: unknown;
} & TaskMapBase;

export function scriptTask<TOutput extends AnyZodOutput, TContext = unknown>(
	def: ScriptTaskDefBase<TOutput, TContext>
): ScriptTaskDef<TOutput, TContext> {
	return { ...def, type: 'script' } as ScriptTaskDef<TOutput, TContext>;
}

export function iaTask<
	TOutput extends AnyZodOutput,
	TContext = unknown,
	TParsed = z.infer<TOutput>
>(def: IaTaskDefBase<TOutput, TContext, TParsed>): IaTaskDef<TOutput, TContext, TParsed> {
	return { ...def, type: 'ia' } as IaTaskDef<TOutput, TContext, TParsed>;
}

function buildScriptTask<TMap extends TaskMapBase, TId extends keyof TMap & string, TContext>(
	id: TId,
	def: ScriptTaskDef<AnyZodOutput, TContext>
): (context: TContext) => ScriptTask<TMap, TId> {
	return (context: TContext) => {
		const propsCtx = { context, state: {} };
		const componentProps =
			typeof def.componentProps === 'function' ? def.componentProps(propsCtx) : def.componentProps;

		return {
			id,
			name: def.name,
			subtype: def.subtype,
			dependencies: def.dependencies ?? [],
			type: 'script',
			component: def.component,
			componentProps,
			gridSpan: def.gridSpan,
			renderOrder: def.renderOrder,
			persist: def.persist,
			enableTTS: def.enableTTS,
			concurrencyGroup: def.concurrencyGroup,
			embeddings: def.embeddings,
			run: async (runtime: TaskRuntime<TMap, TId>) => {
				const result = await def.run({
					runId: runtime.runId,
					taskId: runtime.taskId,
					state: runtime.state,
					context,
					update: runtime.update,
					enqueueTasks: runtime.enqueueTasks as (
						tasks: Task<TaskMapBase>[],
						options?: { restart?: boolean }
					) => void
				});
				return result as TMap[TId];
			}
		};
	};
}

export function buildScriptTaskFromDef<
	TMap extends TaskMapBase = TaskMapBase,
	TId extends keyof TMap & string = keyof TMap & string
>(id: TId, def: ScriptTaskDef): ScriptTask<TMap, TId> {
	return buildScriptTask<TMap, TId, unknown>(id, def)(undefined);
}

export function buildIaTask<
	TMap extends TaskMapBase,
	TId extends keyof TMap & string,
	TContext,
	TParsed = TMap[TId]
>(
	id: TId,
	def: IaTaskDef<AnyZodOutput, TContext, TParsed>
): (context: TContext) => IaTask<TMap, TId, TParsed> {
	return (context: TContext) => {
		const componentProps =
			typeof def.componentProps === 'function'
				? def.componentProps({ context, state: {} })
				: def.componentProps;

		return {
			id,
			name: def.name,
			dependencies: def.dependencies ?? [],
			type: 'ia',
			subtype: def.subtype,
			systemMessage: def.systemMessage as IaTask<TMap, TId>['systemMessage'],
			userMessage: def.userMessage as IaTask<TMap, TId>['userMessage'],
			completionOptions: def.completionOptions as IaTask<TMap, TId>['completionOptions'],
			baseUrl: def.baseUrl,
			extractorConfig: def.extractorConfig,
			categoryNames: def.categoryNames,
			directResult: def.directResult
				? (runtime: TaskRuntime<TMap, TId>) =>
						def.directResult!({
							runId: runtime.runId,
							taskId: runtime.taskId,
							state: runtime.state,
							context,
							update: runtime.update,
							enqueueTasks: runtime.enqueueTasks as (
								tasks: Task<TaskMapBase>[],
								options?: { restart?: boolean }
							) => void
						})
				: undefined,
			component: def.component,
			componentProps,
			gridSpan: def.gridSpan,
			renderOrder: def.renderOrder,
			persist: def.persist,
			enableTTS: def.enableTTS,
			concurrencyGroup: def.concurrencyGroup,
			embeddings: def.embeddings,
			run: def.run
				? async (runtime: TaskRuntime<TMap, TId>) => {
						return def.run!({
							runId: runtime.runId,
							taskId: runtime.taskId,
							state: runtime.state,
							context,
							update: runtime.update,
							enqueueTasks: runtime.enqueueTasks as (
								tasks: Task<TaskMapBase>[],
								options?: { restart?: boolean }
							) => void
						});
					}
				: undefined,
			resultParser: def.resultParser
				? async (text: string, ctx: { state: Readonly<TaskGlobalState<TMap>> }) => {
						return def.resultParser!(text, { ...ctx, context });
					}
				: undefined,
			onComplete: def.onComplete
				? async (params: {
						result: TParsed;
						runResult: string;
						state: Readonly<TaskGlobalState<TMap>>;
					}) => {
						await def.onComplete!({ ...params, context });
					}
				: undefined
		};
	};
}

export function getRequiredTaskState<
	TState extends Record<string, unknown>,
	TId extends keyof TState & string
>(
	state: Readonly<TState>,
	taskId: TId,
	errorMessage = `Missing task state for "${taskId}"`
): TState[TId] {
	const value = state[taskId];
	if (value === undefined) {
		throw new Error(errorMessage);
	}
	return value as TState[TId];
}

export function requireStringState(
	state: Readonly<Record<string, unknown>>,
	taskId: string
): string {
	const value = state[taskId];
	if (typeof value !== 'string') {
		throw new Error(`Missing content from dependency "${taskId}"`);
	}
	return value;
}

export function requireFinalResponseString(
	state: Readonly<Record<string, unknown>>,
	taskId: string
): string {
	const value = state[taskId];
	if (typeof value === 'string') return value;
	if (value && typeof value === 'object') {
		const finalResponse = (value as Record<string, unknown>).finalResponse;
		if (typeof finalResponse === 'string') return finalResponse;
	}
	throw new Error(`Missing content from dependency "${taskId}"`);
}

export function createContentGetter<TContentKey extends string>(contentTaskName: TContentKey) {
	return function getContentFromState(state: Readonly<Record<string, unknown>>): string {
		const value = state[contentTaskName];
		if (value === undefined) {
			throw new Error(`Missing content for task "${contentTaskName}"`);
		}
		return String(value);
	};
}
