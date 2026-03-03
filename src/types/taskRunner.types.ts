import type {
	LlamaChatCompletionsRequest,
	LlamaChatCompletionsResponse,
} from "@/lib/utils/llama-completions";

export enum TaskTypesEnum {
	SCRIPT = "script",
	IA = "ia",
}

export type TaskType = "script" | "ia";

export type TaskStatus = "pending" | "running" | "done" | "failed" | "blocked";

export type TaskMapBase = Record<string, unknown>;

export type TaskGlobalState<TMap extends TaskMapBase> = Partial<TMap>;

export interface TaskStateUpdate {
	data?: unknown;
	debug?: string;
}

export type TaskStatusUpdater = (update: TaskStateUpdate) => void;

interface TaskBase<TMap extends TaskMapBase, TId extends keyof TMap & string> {
	id: TId;
	name: string;
	dependencies: (keyof TMap & string)[];
	type: TaskType;
	data?: TMap[TId];
	component?: string;
	status?: TaskStatus;
	error?: string;
	// Optional field to store debug information about the task execution, such as intermediate results or logs
	debug?: string;
	startedAt?: number;
	endedAt?: number;
}

export interface ScriptTask<
	TMap extends TaskMapBase = TaskMapBase,
	TId extends keyof TMap & string = keyof TMap & string,
> extends TaskBase<TMap, TId> {
	type: "script";
	run: (
		state: Readonly<TaskGlobalState<TMap>>,
		statusUpdater: TaskStatusUpdater,
	) => Promise<TMap[TId]> | TMap[TId];
	systemMessage?: never;
	userMessage?: never;
	completionOptions?: never;
	baseUrl?: never;
}

export interface IaTask<
	TMap extends TaskMapBase = TaskMapBase,
	TId extends keyof TMap & string = keyof TMap & string,
> extends TaskBase<TMap, TId> {
	type: "ia";
	systemMessage: string;
	userMessage: string;
	completionOptions: Omit<LlamaChatCompletionsRequest, "messages" | "model"> & { model: string };
	baseUrl?: string;
	run?: (
		state: Readonly<TaskGlobalState<TMap>>,
		statusUpdater: TaskStatusUpdater,
	) => Promise<string> | string;
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

export interface IaTaskResult {
	text: string;
	response: LlamaChatCompletionsResponse;
}
