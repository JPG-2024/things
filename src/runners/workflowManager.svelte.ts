import {
	createTaskRunner,
	type TaskRunnerStore,
} from "@/runners/taskRunner.svelte";
import type {
	Task,
	TaskMapBase,
	TaskRunSummary,
	WorkflowRunOptions,
	WorkflowRunStatus,
	WorkflowRunSummary,
} from "@/types/taskRunner.types";

type WorkflowRunRecord<TMap extends TaskMapBase = TaskMapBase> =
	WorkflowRunSummary<TMap> & {
		runner: TaskRunnerStore<TMap>;
		promise?: Promise<TaskRunSummary<TMap>>;
	};

function toErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === "string") return error;
	try {
		return JSON.stringify(error);
	} catch {
		return "Unknown error";
	}
}

function isSuccessfulSummary(
	summary: Pick<TaskRunSummary, "failed" | "blocked">
): boolean {
	return summary.failed === 0 && summary.blocked === 0;
}

export function buildWorkflowRunId(kind: string, scope: string) {
	return `${kind}:${scope}`;
}

export class WorkflowManager {
	activeRunId = $state<string | undefined>(undefined);
	private runs = new Map<string, WorkflowRunRecord<TaskMapBase>>();

	get activeRunner(): TaskRunnerStore | undefined {
		return this.activeRunId ? this.getRunner(this.activeRunId) : undefined;
	}

	getRunner<TMap extends TaskMapBase = TaskMapBase>(
		id: string
	): TaskRunnerStore<TMap> | undefined {
		return this.runs.get(id)?.runner as TaskRunnerStore<TMap> | undefined;
	}

	getRunSummary<TMap extends TaskMapBase = TaskMapBase>(
		id: string
	): WorkflowRunSummary<TMap> | undefined {
		const run = this.runs.get(id);
		if (!run) return undefined;

		return {
			id: run.id,
			status: run.status,
			dependencies: [...run.dependencies],
			summary: run.summary,
			error: run.error,
			startedAt: run.startedAt,
			endedAt: run.endedAt,
		} as WorkflowRunSummary<TMap>;
	}

	setActiveRun(id: string | undefined) {
		this.activeRunId = id;
	}

	hydrateRun<TMap extends TaskMapBase = TaskMapBase>(
		id: string,
		tasks: Task<TMap>[],
		options?: { makeActive?: boolean; status?: WorkflowRunStatus }
	): TaskRunnerStore<TMap> {
		const record = this.ensureRun<TMap>(id);
		record.runner.setTasks(tasks);
		record.status = options?.status ?? record.status;
		record.summary = undefined;
		record.error = undefined;
		record.startedAt = undefined;
		record.endedAt = undefined;
		record.promise = undefined;

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
		const existing = this.runs.get(id) as WorkflowRunRecord<TMap> | undefined;
		if (existing?.status === "running" && existing.promise) {
			if (options?.makeActive ?? true) {
				this.setActiveRun(id);
			}
			return existing.promise;
		}

		const record = this.ensureRun<TMap>(id);
		record.dependencies = [...(options?.dependencies ?? [])];
		record.status = "pending";
		record.error = undefined;
		record.summary = undefined;
		record.startedAt = Date.now();
		record.endedAt = undefined;
		record.runner.setTasks(tasks);

		if (options?.makeActive ?? true) {
			this.setActiveRun(id);
		}

		const promise = this.executeRun(record, options);
		record.promise = promise;

		return promise;
	}

	private ensureRun<TMap extends TaskMapBase>(
		id: string
	): WorkflowRunRecord<TMap> {
		const existing = this.runs.get(id) as WorkflowRunRecord<TMap> | undefined;
		if (existing) {
			return existing;
		}

		const record: WorkflowRunRecord<TMap> = {
			id,
			status: "idle",
			dependencies: [],
			runner: createTaskRunner<TMap>(id),
		};

		this.runs.set(id, record as unknown as WorkflowRunRecord<TaskMapBase>);
		return record;
	}

	private async executeRun<TMap extends TaskMapBase>(
		record: WorkflowRunRecord<TMap>,
		options?: WorkflowRunOptions
	): Promise<TaskRunSummary<TMap>> {
		try {
			await this.waitForDependencies(record.dependencies);
			record.status = "running";

			const summary = await record.runner.run({
				force: options?.force,
				stream: options?.stream,
			});
			record.summary = summary;
			record.endedAt = Date.now();
			record.status = isSuccessfulSummary(summary) ? "done" : "failed";
			record.promise = undefined;

			return summary;
		} catch (error) {
			record.error = toErrorMessage(error);
			record.endedAt = Date.now();
			record.status = record.error.startsWith("Blocked by dependency")
				? "blocked"
				: "failed";
			record.promise = undefined;
			throw error;
		}
	}

	private async waitForDependencies(dependencies: string[]) {
		for (const dependencyId of dependencies) {
			const dependency = this.runs.get(dependencyId);
			if (!dependency) {
				throw new Error(`Unknown workflow dependency: ${dependencyId}`);
			}

			const summary = dependency.promise
				? await dependency.promise
				: dependency.summary;
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
