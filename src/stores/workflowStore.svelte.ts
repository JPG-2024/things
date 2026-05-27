import { SvelteMap } from 'svelte/reactivity';
import type { TaskRunnerStore } from '@/runners/taskRunner.svelte';
import type {
	Task,
	IaTaskProgress,
	TaskMapBase,
	TaskRunSummary,
	WorkflowRunStatus
} from '@/types/taskRunner.types';

export interface WorkflowRunState<TMap extends TaskMapBase = TaskMapBase> {
	id: string;
	status: WorkflowRunStatus;
	dependencies: string[];
	summary?: TaskRunSummary<TMap>;
	error?: string;
	startedAt?: number;
	endedAt?: number;
	runner: TaskRunnerStore<TMap>;
	promise?: Promise<TaskRunSummary<TMap>>;
}

type WorkflowTaskStackEntry<TMap extends TaskMapBase = TaskMapBase> = {
	runId: string;
	task: Task<TMap>;
};

export class WorkflowState {
	focusedRunId = $state<string | undefined>(undefined);
	stackedRunIds = $state<string[]>([]);
	runs = $state(new SvelteMap<string, WorkflowRunState>());

	focusedRun = $derived(this.focusedRunId ? this.runs.get(this.focusedRunId) : undefined);
	focusedRunStatus = $derived(this.focusedRun?.status);
	focusedRunTasks = $derived(this.focusedRun?.runner.tasks ?? []);

	allRuns = $derived([...this.runs.values()]);
	runningRuns = $derived(this.allRuns.filter((r) => r.status === 'running'));
	isAnyRunning = $derived(this.runningRuns.length > 0);

	stackedTasks = $derived.by(() => {
		return this.stackedRunIds.flatMap((runId) => {
			const run = this.runs.get(runId);
			if (!run) return [];
			return run.runner.tasks.map((task) => ({ runId, task }) as WorkflowTaskStackEntry);
		});
	});

	getRun<TMap extends TaskMapBase>(id: string): WorkflowRunState<TMap> | undefined {
		return this.runs.get(id) as WorkflowRunState<TMap> | undefined;
	}

	getRunStatus(id: string): WorkflowRunStatus | undefined {
		return this.runs.get(id)?.status;
	}

	getRunSummary<TMap extends TaskMapBase>(id: string): TaskRunSummary<TMap> | undefined {
		return this.runs.get(id)?.summary as TaskRunSummary<TMap> | undefined;
	}

	getRunTasks<TMap extends TaskMapBase>(id: string): Task<TMap>[] {
		return (this.runs.get(id)?.runner.tasks ?? []) as Task<TMap>[];
	}

	getTaskData<TMap extends TaskMapBase, TId extends keyof TMap & string>(
		runId: string,
		taskId: TId
	): TMap[TId] | undefined {
		return this.runs.get(runId)?.runner.getTaskData(taskId) as TMap[TId] | undefined;
	}

	isRunRunning(id: string): boolean {
		return this.runs.get(id)?.status === 'running';
	}

	getRunner<TMap extends TaskMapBase>(id: string): TaskRunnerStore<TMap> | undefined {
		return this.runs.get(id)?.runner as TaskRunnerStore<TMap> | undefined;
	}

	setActiveRun(id: string | undefined) {
		this.focusedRunId = id;
	}

	upsertRun<TMap extends TaskMapBase>(run: WorkflowRunState<TMap>) {
		this.runs.set(run.id, { ...run } as unknown as WorkflowRunState);
	}

	updateRunStatus(id: string, status: WorkflowRunStatus) {
		const run = this.runs.get(id);
		if (!run) return;
		this.runs.set(id, { ...run, status });
	}

	updateRunSummary<TMap extends TaskMapBase>(id: string, summary: TaskRunSummary<TMap>) {
		const run = this.runs.get(id);
		if (!run) return;
		this.runs.set(id, { ...run, summary: summary as TaskRunSummary, endedAt: Date.now() });
	}

	updateRunError(id: string, error: string) {
		const run = this.runs.get(id);
		if (!run) return;
		this.runs.set(id, { ...run, error });
	}

	getIaTaskProgress(id: string): IaTaskProgress | undefined {
		const run = this.runs.get(id);
		if (!run) return undefined;

		const tasks = run.runner.tasks;
		const iaTasks = tasks.filter((t) => t.type === 'ia');
		if (iaTasks.length === 0) return undefined;

		const runningIaTask = iaTasks.find((t) => t.status === 'running');
		const doneCount = iaTasks.filter((t) => t.status === 'done').length;
		const currentIndex = runningIaTask ? iaTasks.indexOf(runningIaTask) : doneCount;

		return {
			runId: id,
			currentIaTaskIndex: currentIndex,
			totalIaTasks: iaTasks.length,
			currentIaTaskId: runningIaTask?.id,
			currentIaTaskName: runningIaTask?.name
		};
	}

	setStackedRunIds(ids: string[]) {
		this.stackedRunIds = ids;
	}

	removeRun(id: string) {
		this.runs.delete(id);
		if (this.focusedRunId === id) {
			this.focusedRunId = undefined;
		}
	}

	clearStack() {
		for (const runId of this.stackedRunIds) {
			this.runs.delete(runId);
		}
		this.stackedRunIds = [];
		if (this.focusedRunId && this.stackedRunIds.includes(this.focusedRunId)) {
			this.focusedRunId = undefined;
		}
	}
}

export const workflowStore = new WorkflowState();
