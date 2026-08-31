import type { PersistedTaskState } from '@/stores/webStore';
import type { Task, TaskMapBase } from '@/types/taskRunner.types';

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
		task.data = persistedTask.data as Task<TState>['data'];
	}

	if (persistedTask.status) {
		task.status = persistedTask.status;
	}

	return task;
}
