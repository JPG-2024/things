import type { Task, TaskMapBase } from '@/types/taskRunner.types';

export function getTaskData<TMap extends TaskMapBase = TaskMapBase>(
	tasks: Task<TMap>[],
	id: string,
	key?: string
): unknown {
	const task = tasks.find((task) => task.id === id);

	if (!task) return undefined;

	const data = task.data as Record<string, unknown> | undefined;

	return key ? data?.[key] : data;
}
