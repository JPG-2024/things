import type {
	LlamaChatCompletionsRequest,
	LlamaChatCompletionsResponse,
} from '@/lib/utils/llama-completions';

export type TaskType = 'script' | 'ia';

export type TaskStatus = 'pending' | 'running' | 'done' | 'failed' | 'blocked';

export type TaskDependencyState = Record<string, unknown>;

export interface TaskStateUpdate {
	data?: unknown;
	debug?: string;
}

export type TaskStatusUpdater = (update: TaskStateUpdate) => void;

interface TaskBase {
	id: string;
	name: string
	widget: boolean;
	dependencies: string[];
	type: TaskType;
	data?: unknown;
  component?: string;
	status?: TaskStatus;
	error?: string;
	// Optional field to store debug information about the task execution, such as intermediate results or logs
	debug?: string;
	startedAt?: number;
	endedAt?: number;
}

export interface ScriptTask extends TaskBase {
	type: 'script';
	run: (state: TaskDependencyState, statusUpdater: TaskStatusUpdater) => Promise<unknown> | unknown;
	systemMessage?: never;
	userMessage?: never;
	completionOptions?: never;
	baseUrl?: never;
}

export interface IaTask extends TaskBase {
	type: 'ia';
	systemMessage: string;
	userMessage: string;
	completionOptions: Omit<LlamaChatCompletionsRequest, 'messages' | 'model'> & { model: string };
	baseUrl?: string;
	run?: (state: TaskDependencyState, statusUpdater: TaskStatusUpdater) => Promise<string> | string;
}

export type Task = ScriptTask | IaTask;

export interface TaskRunSummary {
	startedAt: number;
	endedAt: number;
	total: number;
	done: number;
	failed: number;
	blocked: number;
	pending: number;
	failedTaskId?: string;
}

export interface TaskRunnerState {
	tasks: Task[];
	running: boolean;
	lastRun?: TaskRunSummary;
}

export interface IaTaskResult {
	text: string;
	response: LlamaChatCompletionsResponse;
}
