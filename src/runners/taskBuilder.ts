import type { PersistedTaskState } from "@/stores/tasksStore";
import type {
	Task,
	TaskMapBase,
	TaskRerunPatch,
} from "@/types/taskRunner.types";

type NoInfer<T> = [T][T extends unknown ? 0 : never];

export type TaskFactory<TState extends TaskMapBase, TContext> = (
	context: TContext
) => Task<TState>;

type TaskFactoryState<TFactory> =
	TFactory extends TaskFactory<
		infer TState extends TaskMapBase,
		infer _TContext
	>
		? TState
		: never;

type TaskFactoryContext<TFactory> =
	TFactory extends TaskFactory<
		infer _TState extends TaskMapBase,
		infer TContext
	>
		? TContext
		: never;

type TaskRegistryBase = Record<string, unknown>;

export type TaskOverride<TState extends TaskMapBase> = TaskRerunPatch<TState>;

export type TaskSelection<
	TState extends TaskMapBase,
	TTaskId extends keyof TState & string,
> = TTaskId | readonly [taskId: TTaskId, overrides: TaskOverride<TState>];

export function createPersistedTaskStateMap(
	persistedTasks: PersistedTaskState[] | undefined
): Map<string, PersistedTaskState> {
	const persistedTaskMap = new Map<string, PersistedTaskState>();

	for (const task of persistedTasks ?? []) {
		persistedTaskMap.set(task.id, task);
	}

	return persistedTaskMap;
}

export function applyPersistedTaskState<TState extends TaskMapBase>(
	task: Task<TState>,
	persistedTask: PersistedTaskState | undefined
): Task<TState> {
	if (!persistedTask) {
		return task;
	}

	if (persistedTask.data !== undefined) {
		task.data = persistedTask.data as Task<TState>["data"];
	}

	if (persistedTask.status) {
		task.status = persistedTask.status;
	}

	if (persistedTask.component) {
		task.component = persistedTask.component;
	}

	return task;
}

export function applyTaskOverrides<TState extends TaskMapBase>(
	task: Task<TState>,
	overrides: TaskOverride<TState> | undefined
): Task<TState> {
	if (!overrides) {
		return task;
	}

	Object.assign(task, overrides);

	return task;
}

function normalizeTaskSelections<
	TState extends TaskMapBase,
	TTaskId extends keyof TState & string,
>(
	selectedTaskIds: ReadonlyArray<TaskSelection<TState, TTaskId>>
): {
	orderedTaskIds: TTaskId[];
	taskOverrides: Map<TTaskId, TaskOverride<TState>>;
} {
	const orderedTaskIds: TTaskId[] = [];
	const taskOverrides = new Map<TTaskId, TaskOverride<TState>>();

	for (const selectedTask of selectedTaskIds) {
		if (Array.isArray(selectedTask)) {
			const [taskId, overrides] = selectedTask;
			orderedTaskIds.push(taskId);
			taskOverrides.set(taskId, overrides);
			continue;
		}

		orderedTaskIds.push(selectedTask as TTaskId);
	}

	return { orderedTaskIds, taskOverrides };
}

type BuildTaskSubroutineOptions = {
	persistedTasks?: PersistedTaskState[];
	Rebuild?: boolean;
};

export async function buildTaskSubroutine<
	TRegistry extends TaskRegistryBase,
	TTaskId extends keyof TRegistry & string,
	TState extends TaskMapBase = TaskFactoryState<TRegistry[TTaskId]>,
	TContext = TaskFactoryContext<TRegistry[TTaskId]>,
>(
	selectedTaskIds: ReadonlyArray<TaskSelection<NoInfer<TState>, TTaskId>>,
	taskRegistry: TRegistry,
	context?: TContext,
	options?: BuildTaskSubroutineOptions
): Promise<Task<TState>[]> {
	const persistedTaskMap = createPersistedTaskStateMap(options?.persistedTasks);
	const shouldRebuild = options?.Rebuild ?? false;
	const { orderedTaskIds, taskOverrides } =
		normalizeTaskSelections(selectedTaskIds);
	const visited = new Set<TTaskId>();
	const orderedTasks: Task<TState>[] = [];

	const visit = (taskId: TTaskId) => {
		if (visited.has(taskId)) {
			return;
		}

		const factory = taskRegistry[taskId] as
			| TaskFactory<TState, TContext>
			| undefined;
		if (!factory) {
			throw new Error(`Unknown task: ${taskId}`);
		}

		const task = applyTaskOverrides(
			applyPersistedTaskState(
				factory(context as TContext),
				persistedTaskMap.get(taskId)
			),
			taskOverrides.get(taskId)
		);

		if (!shouldRebuild && task.status === "done") {
			visited.add(taskId);
			orderedTasks.push({
				...task,
				dependencies: [],
			});
			return;
		}

		for (const dependencyId of task.dependencies as TTaskId[]) {
			visit(dependencyId);
		}

		visited.add(taskId);
		orderedTasks.push(task);
	};

	for (const taskId of orderedTaskIds) {
		visit(taskId);
	}

	return orderedTasks;
}
