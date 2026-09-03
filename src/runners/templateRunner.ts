import type { Task, TaskRunSummary } from '@/types/taskRunner.types';
import type { Template } from '@/types/template.types';
import { workflowManager } from '@/runners/workflowManager.svelte';
import { getProfileTemplateId, getTemplate } from '@/stores/templateStore';
import { buildTasksFromTemplate } from '@/runners/templateBuilder';
import type { PersistedTaskState } from '@/stores/webStore';
import { createPersistedTaskStateMap, applyPersistedTaskState } from '@/runners/taskBuilder';

export interface RunTemplateWorkflowOptions {
	makeActive?: boolean;
	Rebuild?: boolean;
	cachedTasks?: PersistedTaskState[] | null;
	skipTaskIds?: string[];
	onRunResult?: (runResult: TaskRunSummary) => void | Promise<void>;
	defaultTasksFactory?: () => Task[];
}

import { DependencyGraph } from '@/runners/DependencyGraph';

function pruneUnneededTasks(tasks: Task[]): void {
	const graph = new DependencyGraph();
	graph.buildFromTasks(tasks);

	const taskMap = new Map<string, Task>();
	const satisfied = new Set<string>();

	for (const task of tasks) {
		taskMap.set(task.id, task);
		if (task.status === 'done' && task.data !== undefined) {
			satisfied.add(task.id);
		}
	}

	const needed = new Map<string, boolean>();

	function isNeeded(taskId: string): boolean {
		if (needed.has(taskId)) {
			return needed.get(taskId)!;
		}

		const task = taskMap.get(taskId);
		if (!task) {
			needed.set(taskId, false);
			return false;
		}

		if (satisfied.has(taskId)) {
			needed.set(taskId, false);
			return false;
		}

		const dependents = graph.getDependents(taskId);
		if (dependents.length === 0) {
			needed.set(taskId, true);
			return true;
		}

		let anyDependentNeeded = false;
		for (const depId of dependents) {
			if (isNeeded(depId)) {
				anyDependentNeeded = true;
				break;
			}
		}

		needed.set(taskId, anyDependentNeeded);
		return anyDependentNeeded;
	}

	for (const task of tasks) {
		isNeeded(task.id);
	}

	for (const task of tasks) {
		if (!needed.get(task.id)) {
			task.status = 'done';
		}
	}
}

export async function runTemplateWorkflow(
	runId: string,
	profileId: string,
	initialTasks: Task[],
	options: RunTemplateWorkflowOptions = {}
): Promise<Task[]> {
	const templateId = await getProfileTemplateId(profileId);
	const template = templateId ? await getTemplate(templateId) : null;

	const templateTasks = template
		? buildTasksFromTemplate(template.tasks)
		: (options.defaultTasksFactory?.() ?? []);

	let allTasks = [...initialTasks, ...templateTasks];

	if (options.skipTaskIds?.length) {
		const skipInit = new Set(options.skipTaskIds);
		const skipGraph = new DependencyGraph();
		skipGraph.buildFromTasks(allTasks);
		const closure = new Set<string>(skipInit);
		for (const id of skipInit) {
			for (const desc of skipGraph.getDescendants(id)) {
				closure.add(desc);
			}
		}
		allTasks = allTasks.filter((t) => !closure.has(t.id));
	}

	if (!options.Rebuild) {
		const cachedMap = createPersistedTaskStateMap(options.cachedTasks ?? undefined);
		for (const task of allTasks) {
			const cached = cachedMap.get(task.id);
			if (cached) {
				applyPersistedTaskState(task, cached);
			}
		}

		pruneUnneededTasks(allTasks);
	}

	const runResult = await workflowManager.run(runId, allTasks, {
		makeActive: options.makeActive ?? true,
		Rebuild: options.Rebuild
	});

	if (options.onRunResult) {
		await options.onRunResult(runResult);
	}

	return runResult.tasks as Task[];
}
