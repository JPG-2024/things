import { createTaskRunner, type TaskRunnerStore } from '@/runners/taskRunner.svelte';
import { workflowStore, type WorkflowRunState } from '@/stores/workflowStore.svelte';
import type {
	Task,
	TaskMapBase,
	TaskRerunOptions,
	TaskRerunPatch,
	TaskRunSummary,
	WorkflowRunOptions,
	WorkflowRunStatus,
	WorkflowRunSummary
} from '@/types/taskRunner.types';

type WorkflowTaskStackEntry<TMap extends TaskMapBase = TaskMapBase> = {
	runId: string;
	task: Task<TMap>;
};

function toErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === 'string') return error;
	try {
		return JSON.stringify(error);
	} catch {
		return 'Unknown error';
	}
}

function isSuccessfulSummary(summary: Pick<TaskRunSummary, 'failed' | 'blocked'>): boolean {
	return summary.failed === 0 && summary.blocked === 0;
}

export class WorkflowManager {
	private static readonly MAX_RUNS = 20;

	private evictOldRunsIfNeeded() {
		if (workflowStore.runs.size <= WorkflowManager.MAX_RUNS) {
			return;
		}
		const allEntries = [...workflowStore.runs.entries()];
		const completedRuns = allEntries.filter(([id]) => !workflowStore.stackedRunIds.includes(id));
		const sorted = completedRuns.sort((a, b) => {
			const aTime = a[1].endedAt ?? a[1].startedAt ?? 0;
			const bTime = b[1].endedAt ?? b[1].startedAt ?? 0;
			return aTime - bTime;
		});
		const toRemove = sorted.slice(0, workflowStore.runs.size - WorkflowManager.MAX_RUNS);
		for (const [id] of toRemove) {
			workflowStore.removeRun(id);
		}
	}

	get activeRunner(): TaskRunnerStore | undefined {
		return workflowStore.focusedRunId
			? workflowStore.getRunner(workflowStore.focusedRunId)
			: undefined;
	}

	get stackedTasks(): WorkflowTaskStackEntry[] {
		return workflowStore.stackedTasks;
	}

	getRunner<TMap extends TaskMapBase = TaskMapBase>(id: string): TaskRunnerStore<TMap> | undefined {
		return workflowStore.getRunner<TMap>(id);
	}

	getRunSummary<TMap extends TaskMapBase = TaskMapBase>(
		id: string
	): WorkflowRunSummary<TMap> | undefined {
		const run = workflowStore.getRun<TMap>(id);
		if (!run) return undefined;

		return {
			id: run.id,
			status: run.status,
			dependencies: [...run.dependencies],
			summary: run.summary,
			error: run.error,
			startedAt: run.startedAt,
			endedAt: run.endedAt
		} as WorkflowRunSummary<TMap>;
	}

	setActiveRun(id: string | undefined) {
		workflowStore.setActiveRun(id);
	}

	getTaskData<
		TMap extends TaskMapBase = TaskMapBase,
		TId extends keyof TMap & string = keyof TMap & string
	>(runId: string, taskId: TId): TMap[TId] | undefined {
		return workflowStore.getTaskData<TMap, TId>(runId, taskId);
	}

	clearStack() {
		workflowStore.clearStack();
	}

	hydrateRun<TMap extends TaskMapBase = TaskMapBase>(
		id: string,
		tasks: Task<TMap>[],
		options?: {
			makeActive?: boolean;
			parentRunId?: string;
			status?: WorkflowRunStatus;
		}
	): TaskRunnerStore<TMap> {
		let record = workflowStore.getRun<TMap>(id);

		if (!record) {
			this.evictOldRunsIfNeeded();
			record = {
				id,
				status: 'idle',
				dependencies: [],
				runner: createTaskRunner<TMap>(id)
			} as WorkflowRunState<TMap>;
			workflowStore.upsertRun(record);
		}

		this.syncRunStack(record.id, options);
		record.runner.setTasks(tasks);
		record.summary = undefined;
		record.error = undefined;
		record.startedAt = undefined;
		record.endedAt = undefined;
		record.promise = undefined;

		if (options?.status) {
			workflowStore.updateRunStatus(record.id, options.status);
		}

		if (options?.makeActive ?? true) {
			this.setActiveRun(id);
		}

		return record.runner;
	}

	async run<TMap extends TaskMapBase = TaskMapBase>(
		id: string,
		tasks: Task<TMap>[],
		options?: WorkflowRunOptions
	): Promise<TaskRunSummary<TMap>> {
		let record = workflowStore.getRun<TMap>(id);

		if (record?.status === 'running') {
			this.syncRunStack(record.id, options);
			if (options?.makeActive ?? true) {
				this.setActiveRun(id);
			}
			const existingPromise = (record as any).promise;
			if (existingPromise) return existingPromise;
		}

		if (!record) {
			this.evictOldRunsIfNeeded();
			record = {
				id,
				status: 'idle',
				dependencies: [],
				runner: createTaskRunner<TMap>(id)
			} as WorkflowRunState<TMap>;
			workflowStore.upsertRun(record);
		}

		this.syncRunStack(record.id, options);
		record.dependencies = [...(options?.dependencies ?? [])];
		record.error = undefined;
		record.summary = undefined;
		record.startedAt = Date.now();
		record.endedAt = undefined;
		record.runner.setTasks(tasks);

		workflowStore.updateRunStatus(record.id, 'pending');

		if (options?.makeActive ?? true) {
			this.setActiveRun(id);
		}

		const promise = this.executeRun(record, options);
		(record as any).promise = promise;

		return promise;
	}

	async rerunTask<TMap extends TaskMapBase = TaskMapBase>(
		id: string,
		taskId: keyof TMap & string,
		patch?: TaskRerunPatch<TMap>,
		options?: TaskRerunOptions
	): Promise<TaskRunSummary<TMap>> {
		const record = workflowStore.getRun<TMap>(id);
		if (!record) {
			throw new Error(`Unknown workflow run: ${id}`);
		}

		if (record.status === 'running') {
			throw new Error(`Workflow run is already running: ${id}`);
		}

		this.syncRunStack(record.id, {
			makeActive: true,
			parentRunId: undefined
		});
		this.setActiveRun(id);
		record.error = undefined;
		record.summary = undefined;
		record.startedAt = Date.now();
		record.endedAt = undefined;

		workflowStore.updateRunStatus(record.id, 'pending');

		const promise = this.executeTaskRerun(record, taskId, patch, options);
		(record as any).promise = promise;

		return promise;
	}

	private syncRunStack(
		runId: string,
		options?: Pick<WorkflowRunOptions, 'makeActive' | 'parentRunId'>
	) {
		const shouldMakeActive = options?.makeActive ?? true;

		if (shouldMakeActive) {
			workflowStore.setStackedRunIds(
				workflowStore.stackedRunIds[0] === runId ? [...workflowStore.stackedRunIds] : [runId]
			);
			return;
		}

		if (!options?.parentRunId || !workflowStore.stackedRunIds.includes(options.parentRunId)) {
			return;
		}

		if (workflowStore.stackedRunIds.includes(runId)) {
			return;
		}

		workflowStore.setStackedRunIds([...workflowStore.stackedRunIds, runId]);
	}

	private async executeRun<TMap extends TaskMapBase>(
		record: WorkflowRunState<TMap>,
		options?: WorkflowRunOptions
	): Promise<TaskRunSummary<TMap>> {
		try {
			await this.waitForDependencies(record.dependencies);
			workflowStore.updateRunStatus(record.id, 'running');

			const summary = await record.runner.run({
				Rebuild: options?.Rebuild,
				stream: options?.stream
			});
			workflowStore.updateRunSummary(record.id, summary);
			workflowStore.updateRunStatus(record.id, isSuccessfulSummary(summary) ? 'done' : 'failed');
			(record as any).promise = undefined;

			return summary;
		} catch (error) {
			const errorMsg = toErrorMessage(error);
			workflowStore.updateRunError(record.id, errorMsg);
			workflowStore.updateRunStatus(
				record.id,
				errorMsg.startsWith('Blocked by dependency') ? 'blocked' : 'failed'
			);
			(record as any).promise = undefined;
			throw error;
		}
	}

	private async executeTaskRerun<TMap extends TaskMapBase>(
		record: WorkflowRunState<TMap>,
		taskId: keyof TMap & string,
		patch?: TaskRerunPatch<TMap>,
		options?: TaskRerunOptions
	): Promise<TaskRunSummary<TMap>> {
		try {
			workflowStore.updateRunStatus(record.id, 'running');

			const summary = await record.runner.rerunTask(taskId, patch, options);
			workflowStore.updateRunSummary(record.id, summary);
			workflowStore.updateRunStatus(record.id, isSuccessfulSummary(summary) ? 'done' : 'failed');
			(record as any).promise = undefined;

			return summary;
		} catch (error) {
			const errorMsg = toErrorMessage(error);
			workflowStore.updateRunError(record.id, errorMsg);
			workflowStore.updateRunStatus(
				record.id,
				errorMsg.startsWith('Blocked by dependency') ? 'blocked' : 'failed'
			);
			(record as any).promise = undefined;
			throw error;
		}
	}

	private async waitForDependencies(dependencies: string[]) {
		for (const dependencyId of dependencies) {
			const dependency = workflowStore.getRun(dependencyId);
			if (!dependency) {
				throw new Error(`Unknown workflow dependency: ${dependencyId}`);
			}

			const depRecord = dependency as WorkflowRunState & { promise?: Promise<any> };
			const summary = depRecord.promise ? await depRecord.promise : dependency.summary;
			if (!summary) {
				throw new Error(`Blocked by dependency: ${dependencyId}`);
			}

			if (!isSuccessfulSummary(summary)) {
				throw new Error(`Blocked by dependency: ${dependencyId}`);
			}
		}
	}
}

export const workflowManager = new WorkflowManager();
