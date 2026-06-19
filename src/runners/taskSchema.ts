import type { z } from 'zod';
import type {
	IaTask,
	ScriptTask,
	Task,
	TaskGlobalState,
	TaskMapBase,
	TaskRuntime,
	TaskStatusUpdater
} from '@/types/taskRunner.types';

type AnyZodOutput = z.core.$ZodType;

type TaskDefBase<TOutput extends AnyZodOutput, TContext> = {
	name?: string;
	dependencies?: string[];
	component?: string;
	componentProps?:
		| Record<string, unknown>
		| ((ctx: {
				context: TContext;
				state: Readonly<Record<string, unknown>>;
		  }) => Record<string, unknown>);
	gridSpan?: 1 | 2 | 3;
	persist?: boolean;
	output: TOutput;
};

type ScriptTaskDefBase<TOutput extends AnyZodOutput, TContext> = Omit<
	TaskDefBase<TOutput, TContext>,
	'output'
> & {
	output: TOutput;
	run: (ctx: TaskRunContext<TContext, Record<string, unknown>>) => unknown | Promise<unknown>;
};

type IaTaskDefBase<TOutput extends AnyZodOutput, TContext, TParsed = z.infer<TOutput>> = Omit<
	TaskDefBase<TOutput, TContext>,
	'output'
> & {
	output: TOutput;
	systemMessage:
		| string
		| ((ctx: { context: TContext; state: Readonly<Record<string, unknown>> }) => string);
	userMessage:
		| string
		| ((ctx: { context: TContext; state: Readonly<Record<string, unknown>> }) => string);
	completionOptions:
		| Record<string, unknown>
		| ((ctx: {
				context: TContext;
				state: Readonly<Record<string, unknown>>;
		  }) => Record<string, unknown>);
	baseUrl?: string;
	run?: (ctx: TaskRunContext<TContext, Record<string, unknown>>) => string | Promise<string>;
	resultParser?: (text: string) => TParsed | Promise<TParsed>;
	onComplete?: (params: {
		result: unknown;
		runResult: string;
		state: Readonly<Record<string, unknown>>;
	}) => void | Promise<void>;
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

type TaskRunContext<TContext, TState> = {
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

type WorkflowConfig<TContext = unknown> = {
	tasks: Record<string, AnyTaskDef<TContext>>;
};

type InferTaskFromDef<
	TMap extends TaskMapBase,
	TId extends keyof TMap & string,
	TDef extends AnyTaskDef
> = TDef extends { type: 'script' }
	? ScriptTask<TMap, TId>
	: TDef extends IaTaskDefBase<AnyZodOutput, unknown, infer TParsed>
		? IaTask<TMap, TId, TParsed>
		: IaTask<TMap, TId>;

type InferRegistry<TConfig extends WorkflowConfig> = {
	[K in keyof TConfig['tasks']]: (
		ctx: TConfig extends WorkflowConfig<infer TC> ? TC : unknown
	) => InferTaskFromDef<InferTaskMap<TConfig['tasks']>, K & string, TConfig['tasks'][K]>;
};

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
			dependencies: def.dependencies ?? [],
			type: 'script',
			component: def.component,
			componentProps,
			gridSpan: def.gridSpan,
			persist: def.persist,
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

function buildIaTask<
	TMap extends TaskMapBase,
	TId extends keyof TMap & string,
	TContext,
	TParsed = TMap[TId]
>(
	id: TId,
	def: IaTaskDef<AnyZodOutput, TContext, TParsed>
): (context: TContext) => IaTask<TMap, TId, TParsed> {
	return (context: TContext) => {
		const propsCtx = { context, state: {} };
		const systemMessage =
			typeof def.systemMessage === 'function' ? def.systemMessage(propsCtx) : def.systemMessage;
		const userMessage =
			typeof def.userMessage === 'function' ? def.userMessage(propsCtx) : def.userMessage;
		const componentProps =
			typeof def.componentProps === 'function' ? def.componentProps(propsCtx) : def.componentProps;
		const completionOptions =
			typeof def.completionOptions === 'function'
				? def.completionOptions(propsCtx)
				: def.completionOptions;

		return {
			id,
			name: def.name,
			dependencies: def.dependencies ?? [],
			type: 'ia',
			systemMessage,
			userMessage,
			completionOptions: completionOptions as IaTask<TMap, TId>['completionOptions'],
			baseUrl: def.baseUrl,
			component: def.component,
			componentProps,
			gridSpan: def.gridSpan,
			persist: def.persist,
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
			resultParser: def.resultParser as IaTask<TMap, TId, TParsed>['resultParser'],
			onComplete: def.onComplete as IaTask<TMap, TId, TParsed>['onComplete'] as
				| ((params: {
						result: TParsed;
						runResult: string;
						state: Readonly<TaskGlobalState<TMap>>;
				  }) => void | Promise<void>)
				| undefined
		};
	};
}

export function defineWorkflow<TConfig extends WorkflowConfig>(
	config: TConfig
): {
	registry: InferRegistry<TConfig>;
	config: TConfig;
} {
	const registry = {} as Record<string, (context: unknown) => Task<TaskMapBase>>;

	for (const [id, def] of Object.entries(config.tasks)) {
		if (def.type === 'script') {
			registry[id] = buildScriptTask(id, def as ScriptTaskDef<AnyZodOutput, unknown>);
		} else {
			registry[id] = buildIaTask(id, def as IaTaskDef<AnyZodOutput, unknown>);
		}
	}

	return {
		registry: registry as InferRegistry<TConfig>,
		config
	};
}

export type InferTaskState<TWorkflow extends { config: WorkflowConfig }> = InferTaskMap<
	TWorkflow['config']['tasks']
>;

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

export function createContentGetter<TContentKey extends string>(contentTaskName: TContentKey) {
	return function getContentFromState(state: Readonly<Record<string, unknown>>): string {
		const value = state[contentTaskName];
		if (value === undefined) {
			throw new Error(`Missing content for task "${contentTaskName}"`);
		}
		return String(value);
	};
}
