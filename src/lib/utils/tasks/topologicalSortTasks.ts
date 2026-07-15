import type { Task, TaskMapBase } from '@/types/taskRunner.types';

export function topologicalSortTasks<TMap extends TaskMapBase>(tasks: Task<TMap>[]): Task<TMap>[] {
	const taskMap = new Map(tasks.map((task) => [task.id, task]));
	const inDegree = new Map<string, number>();
	const dependents = new Map<string, string[]>();

	for (const task of tasks) {
		const knownDeps = task.dependencies.filter((dep) => taskMap.has(dep));
		inDegree.set(task.id, knownDeps.length);
		dependents.set(task.id, []);
	}

	for (const task of tasks) {
		for (const dep of task.dependencies) {
			if (dependents.has(dep)) {
				dependents.get(dep)!.push(task.id);
			}
		}
	}

	const queue = tasks.filter((task) => (inDegree.get(task.id) ?? 0) === 0).map((task) => task.id);
	const orderedIds: string[] = [];

	while (queue.length > 0) {
		const id = queue.shift()!;
		orderedIds.push(id);

		for (const dependent of dependents.get(id) ?? []) {
			const nextDegree = (inDegree.get(dependent) ?? 0) - 1;
			inDegree.set(dependent, nextDegree);
			if (nextDegree === 0) {
				queue.push(dependent);
			}
		}
	}

	if (orderedIds.length < tasks.length) {
		const remaining = tasks.filter((task) => !orderedIds.includes(task.id));
		return [...orderedIds.map((id) => taskMap.get(id)!), ...remaining];
	}

	return orderedIds.map((id) => taskMap.get(id)!);
}
