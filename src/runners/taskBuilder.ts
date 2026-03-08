import type { PersistedTaskState } from "@/stores/tasksStore";
import type { Task, TaskMapBase } from "@/types/taskRunner.types";

export type TaskFactory<TState extends TaskMapBase, TContext> = (
	context: TContext,
) => Task<TState>;

export function createPersistedTaskStateMap(
	persistedTasks: PersistedTaskState[] | undefined,
): Map<string, PersistedTaskState> {
	const persistedTaskMap = new Map<string, PersistedTaskState>();

	for (const task of persistedTasks ?? []) {
		persistedTaskMap.set(task.id, task);
	}

	return persistedTaskMap;
}

export function applyPersistedTaskState<TState extends TaskMapBase>(
	task: Task<TState>,
	persistedTask: PersistedTaskState | undefined,
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

type BuildTaskSubroutineOptions = {
	persistedTasks?: PersistedTaskState[];
};

export async function buildTaskSubroutine<
	TState extends TaskMapBase,
	TTaskId extends keyof TState & string,
	TContext,
>(
	selectedTaskIds: TTaskId[],
	taskRegistry: Record<TTaskId, TaskFactory<TState, TContext>>,
	context?: TContext,
	options?: BuildTaskSubroutineOptions,
): Promise<Task<TState>[]> {
	const persistedTaskMap = createPersistedTaskStateMap(options?.persistedTasks);
	const visited = new Set<TTaskId>();
	const orderedTasks: Task<TState>[] = [];

	const visit = (taskId: TTaskId) => {
		if (visited.has(taskId)) {
			return;
		}

		const factory = taskRegistry[taskId];
		if (!factory) {
			throw new Error(`Unknown task: ${taskId}`);
		}

		const task = applyPersistedTaskState(factory(context), persistedTaskMap.get(taskId));

		for (const dependencyId of task.dependencies as TTaskId[]) {
			visit(dependencyId);
		}

		visited.add(taskId);
		orderedTasks.push(task);
	};

	for (const taskId of selectedTaskIds) {
		visit(taskId);
	}

	return orderedTasks;
}
