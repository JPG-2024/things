import type {
	LlamaChatCompletionsRequest,
	LlamaChatCompletionsResponse
} from '@/lib/utils/chat-completions-provider';

export enum TaskTypesEnum {
	SCRIPT = 'script',
	IA = 'ia'
}

export type TaskType = 'script' | 'ia';

export type TaskStatus = 'pending' | 'running' | 'done' | 'failed' | 'blocked';

export type WorkflowRunStatus = 'idle' | 'pending' | 'running' | 'done' | 'failed' | 'blocked';

export type TaskMapBase = Record<string, unknown>;
export type TaskComponentProps = Record<string, unknown>;

export type TaskGlobalState<TMap extends TaskMapBase> = Partial<TMap>;

export interface TaskStateUpdate {
	data?: unknown;
	debug?: string;
}

export type TaskStatusUpdater = (update: TaskStateUpdate) => void;

export interface TaskRuntime<
	TMap extends TaskMapBase = TaskMapBase,
	TId extends keyof TMap & string = keyof TMap & string
> {
	runId: string;
	taskId: TId;
	state: Readonly<TaskGlobalState<TMap>>;
	update: TaskStatusUpdater;
	enqueueTasks: (tasks: Task<TMap>[], options?: { restart?: boolean }) => void;
	getTaskData: <TTaskId extends keyof TMap & string>(taskId: TTaskId) => TMap[TTaskId] | undefined;
}

export interface TaskRunOptions {
	Rebuild?: boolean;
	stream?: boolean;
}

export type TaskRerunPatch<TMap extends TaskMapBase = TaskMapBase> = Partial<
	Omit<
		Task<TMap>,
		| 'id'
		| 'dependencies'
		| 'type'
		| 'run'
		| 'data'
		| 'status'
		| 'error'
		| 'debug'
		| 'startedAt'
		| 'endedAt'
		| 'onComplete'
	>
>;

export interface TaskRerunOptions extends TaskRunOptions {}

export interface TaskBase<TMap extends TaskMapBase, TId extends keyof TMap & string> {
	id: TId;
	name?: string;
	dependencies: (keyof TMap & string)[];
	type: TaskType;
	data?: TMap[TId];
	component?: string;
	componentProps?: TaskComponentProps;
	gridSpan?: 1 | 2 | 3;
	persist?: boolean;
	status?: TaskStatus;
	error?: string;
	debug?: string;
	startedAt?: number;
	endedAt?: number;
}

export interface ScriptTask<
	TMap extends TaskMapBase = TaskMapBase,
	TId extends keyof TMap & string = keyof TMap & string
> extends TaskBase<TMap, TId> {
	type: 'script';
	run(runtime: TaskRuntime<TMap, TId>): Promise<TMap[TId]> | TMap[TId];
	systemMessage?: never;
	userMessage?: never;
	completionOptions?: never;
	baseUrl?: never;
}

export interface IaTask<
	TMap extends TaskMapBase = TaskMapBase,
	TId extends keyof TMap & string = keyof TMap & string,
	TParsed = TMap[TId]
> extends TaskBase<TMap, TId> {
	type: 'ia';
	systemMessage: string;
	userMessage: string;
	completionOptions: Omit<LlamaChatCompletionsRequest, 'messages' | 'model'> & {
		model: string;
	};
	baseUrl?: string;
	run?(runtime: TaskRuntime<TMap, TId>): Promise<string> | string;
	resultParser?: (text: string) => TParsed | Promise<TParsed>;
	onComplete?: (params: {
		result: TParsed;
		runResult: string;
		state: Readonly<TaskGlobalState<TMap>>;
	}) => void | Promise<void>;
}

export type Task<TMap extends TaskMapBase = TaskMapBase> = ScriptTask<TMap> | IaTask<TMap>;

export interface TaskRunSummary<TMap extends TaskMapBase = TaskMapBase> {
	startedAt: number;
	endedAt: number;
	tasks: Task<TMap>[];
	total: number;
	done: number;
	failed: number;
	blocked: number;
	pending: number;
	failedTaskId?: string;
}

export interface TaskRunnerState<TMap extends TaskMapBase = TaskMapBase> {
	tasks: Task<TMap>[];
	running: boolean;
	lastRun?: TaskRunSummary<TMap>;
}

export interface WorkflowRunOptions {
	dependencies?: string[];
	Rebuild?: boolean;
	makeActive?: boolean;
	parentRunId?: string;
	stream?: boolean;
}

export interface WorkflowRunSummary<TMap extends TaskMapBase = TaskMapBase> {
	id: string;
	status: WorkflowRunStatus;
	dependencies: string[];
	summary?: TaskRunSummary<TMap>;
	error?: string;
	startedAt?: number;
	endedAt?: number;
}

export interface IaTaskResult {
	text: string;
	response: LlamaChatCompletionsResponse;
}

export interface IaTaskProgress {
	runId: string;
	currentIaTaskIndex: number;
	totalIaTasks: number;
	currentIaTaskId?: string;
	currentIaTaskName?: string;
}
