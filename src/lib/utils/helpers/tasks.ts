import type { Task } from '@/types/taskRunner.types';

export function getTaskData(tasks: Task[], id: string, key?: string) {
	const task = tasks.find((task) => task.id === id);

	if (!task) return undefined;

	const data = task.data as Record<string, unknown> | undefined;

	return key ? data?.[key] : data;
}
