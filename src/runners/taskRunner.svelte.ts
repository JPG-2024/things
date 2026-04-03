import {
	chatCompletions,
	LlamaChatCompletionError,
	type LlamaChatCompletionsRequest,
} from "@/lib/utils/llama-completions";
import type {
	IaTask,
	Task,
	TaskGlobalState,
	TaskMapBase,
	TaskRerunOptions,
	TaskRerunPatch,
	TaskRunOptions,
	TaskRunSummary,
	TaskRuntime,
	TaskStateUpdate,
	TaskStatus,
	TaskStatusUpdater,
} from "@/types/taskRunner.types";

/**
 * Convert various error shapes into a readable message string.
 * @param error - The error to normalize.
 * @returns A human-readable error message.
 */
function toErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === "string") return error;
	try {
		return JSON.stringify(error);
	} catch {
		return "Unknown error";
	}
}

function formatTaskExecutionError(error: unknown): {
	message: string;
	debug?: string;
} {
	const rawMessage = toErrorMessage(error);

	if (error instanceof LlamaChatCompletionError) {
		if (
			error.status === undefined ||
			rawMessage.includes("not running or not reachable")
		) {
			return {
				message: "Local AI service unavailable. Start llama-server and retry.",
				debug: rawMessage,
			};
		}

		return {
			message: rawMessage.replace(
				/^llama-server \/v1\/chat\/completions failed:\s*/u,
				""
			),
			debug: rawMessage,
		};
	}

	return { message: rawMessage };
}

/**
 * Extract plain assistant text from a Task data payload.
 * @param content - Task data which may be text, array chunks, or other.
 * @returns Concatenated assistant text or empty string.
 */
function collectAssistantText(content: Task["data"]): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";

	let text = "";
	for (const part of content) {
		if (
			part &&
			typeof part === "object" &&
			"type" in part &&
			part.type === "text" &&
			"text" in part
		) {
			const chunk = part.text;
			if (typeof chunk === "string") text += chunk;
		}
	}

	return text;
}

function createRunId() {
	if (
		typeof crypto !== "undefined" &&
		typeof crypto.randomUUID === "function"
	) {
		return crypto.randomUUID();
	}

	return `runner-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export class TaskRunnerStore<TMap extends TaskMapBase = TaskMapBase> {
	readonly id: string;
	tasks = $state<Task<TMap>[]>([]);
	running = $state(false);
	lastRun = $state<TaskRunSummary<TMap> | undefined>(undefined);
	private pendingTasksQueue: Task<TMap>[] = [];
	private restartRequested = false;

	constructor(id = createRunId()) {
		this.id = id;
	}

	/**
	 * Limpia completamente el state del TaskRunnerStore.
	 * Elimina todas las tareas, reinicia la cola de pendientes, flags y resultados previos.
	 */
	clear() {
		this.tasks = [];
		this.pendingTasksQueue = [];
		this.running = false;
		this.lastRun = undefined;
		this.restartRequested = false;
	}

	/**
	 * Replace the store's tasks with a new set (defensive copy).
	 * @param tasks - Array of tasks to set.
	 */
	setTasks(tasks: Task<TMap>[]) {
		this.tasks = tasks.map((task) => ({
			...task,
			dependencies: [...(task.dependencies ?? [])],
			status: task.status ?? "pending",
			error: task.error,
			debug: task.debug,
		})) as Task<TMap>[];
		this.pendingTasksQueue = [];
		this.restartRequested = false;
	}

	/**
	 * Queue tasks to be added while a run is in progress.
	 * @param tasks - Tasks to enqueue.
	 * @param options - Optional behavior flags.
	 */
	enqueueTasks(tasks: Task<TMap>[], options?: { restart?: boolean }) {
		if (!tasks.length) return;

		const safeTasks = tasks.map((task) => ({
			...task,
			dependencies: [...(task.dependencies ?? [])],
			status: task.status ?? "pending",
		}));

		this.pendingTasksQueue.push(...safeTasks);
		if (options?.restart) {
			this.restartRequested = true;
		}
	}

	/**
	 * Create a snapshot of the current tasks (defensive copy).
	 * @returns An array of tasks with copied dependencies.
	 */
	private snapshotTasks(): Task<TMap>[] {
		return this.tasks.map((task) => ({
			...task,
			dependencies: [...(task.dependencies ?? [])],
		})) as Task<TMap>[];
	}

	/**
	 * Insert or update a single task by id.
	 * @param task - Task to upsert.
	 */
	upsertTask(task: Task<TMap>) {
		const index = this.tasks.findIndex((item) => item.id === task.id);
		if (index === -1) {
			this.tasks = [
				...this.tasks,
				{
					...task,
					dependencies: [...(task.dependencies ?? [])],
					status: task.status ?? "pending",
				},
			];
			return;
		}

		this.tasks[index] = {
			...task,
			dependencies: [...(task.dependencies ?? [])],
			status: task.status ?? this.tasks[index].status ?? "pending",
		};
	}

	/**
	 * Add queued tasks to the active list and re-validate graph.
	 */
	private flushQueuedTasks() {
		if (this.pendingTasksQueue.length === 0) return;

		for (const task of this.pendingTasksQueue) {
			this.upsertTask(task);
		}

		this.pendingTasksQueue = [];
		this.validateTasks();
	}

	/**
	 * Remove a task by id.
	 * @param taskId - Id of the task to remove.
	 */
	removeTask(taskId: string) {
		this.tasks = this.tasks.filter((task) => task.id !== taskId);
	}

	/**
	 * Reset statuses and runtime metadata on all tasks.
	 * @param options - Controls whether already completed tasks should be preserved.
	 */
	resetStatuses(options?: TaskRunOptions) {
		const shouldRebuild = options?.Rebuild ?? false;

		for (const task of this.tasks) {
			if (!shouldRebuild && task.status === "done") {
				task.error = undefined;
				continue;
			}

			task.status = "pending";
			task.error = undefined;
			task.startedAt = undefined;
			task.endedAt = undefined;
			task.debug = undefined;
			task.data = undefined; // Clear previous data to avoid stale results when re-running tasks
		}
	}

	/**
	 * Reset runtime fields for a specific set of tasks.
	 * @param taskIds - Task ids to reset.
	 */
	private resetTaskIds(taskIds: Iterable<string>) {
		for (const taskId of taskIds) {
			const task = this.getTaskById(taskId);
			if (!task) continue;

			task.status = "pending";
			task.error = undefined;
			task.startedAt = undefined;
			task.endedAt = undefined;
			task.debug = undefined;
			task.data = undefined;
		}
	}

	/**
	 * Get stored data for a task.
	 * @param taskId - Task id to fetch data for.
	 * @returns The task's data or undefined.
	 */
	getTaskData<TId extends keyof TMap & string = keyof TMap & string>(
		taskId: TId
	): TMap[TId] | undefined {
		return this.getTaskById(taskId)?.data as TMap[TId] | undefined;
	}

	/**
	 * Find a task by id.
	 * @param taskId - Id of the task.
	 * @returns The Task or undefined.
	 */
	private getTaskById(taskId: string): Task<TMap> | undefined {
		return this.tasks.find((task) => task.id === taskId);
	}

	/**
	 * Get all descendant task ids that depend on the provided task.
	 * @param taskId - Root task id.
	 * @returns Descendant task ids.
	 */
	private getDescendantTaskIds(taskId: string): string[] {
		const descendants = new Set<string>();
		const queue = [taskId];

		while (queue.length > 0) {
			const current = queue.shift();
			if (!current) continue;

			for (const task of this.tasks) {
				if (task.dependencies.includes(current) && !descendants.has(task.id)) {
					descendants.add(task.id);
					queue.push(task.id);
				}
			}
		}

		return [...descendants];
	}

	/**
	 * Build a global state object mapping all task ids to their current data.
	 * @returns The TaskGlobalState mapping.
	 */
	private getGlobalData(): TaskGlobalState<TMap> {
		const state: Record<string, unknown> = {};
		for (const currentTask of this.tasks) {
			state[currentTask.id] = currentTask.data;
		}
		return state as TaskGlobalState<TMap>;
	}

	/**
	 * Patch fields on a task.
	 * @param taskId - Id of the task to patch.
	 * @param patch - Partial task fields to assign.
	 */
	private setTaskFields(taskId: string, patch: Partial<Task<TMap>>) {
		const task = this.getTaskById(taskId);
		if (!task) return;
		Object.assign(task, patch);
	}

	/**
	 * Apply editable overrides to a task before re-running it.
	 * @param taskId - Task id to patch.
	 * @param patch - Editable task fields.
	 */
	private patchTask(taskId: string, patch?: TaskRerunPatch<TMap>) {
		if (!patch) return;
		this.setTaskFields(taskId, patch as Partial<Task<TMap>>);
	}

	/**
	 * Create a TaskStatusUpdater used by script tasks to report progress.
	 * @param taskId - Task id to update.
	 * @returns A status updater callback.
	 */
	private statusUpdaterFor(taskId: string): TaskStatusUpdater {
		return (update: TaskStateUpdate) => {
			this.setTaskFields(taskId, {
				...(update.data !== undefined
					? { data: update.data as TMap[keyof TMap & string] }
					: {}),
				...(update.debug !== undefined ? { debug: update.debug } : {}),
			});
		};
	}

	private runtimeFor<TId extends keyof TMap & string>(
		taskId: TId
	): TaskRuntime<TMap, TId> {
		return {
			runId: this.id,
			taskId,
			state: this.getGlobalData(),
			update: this.statusUpdaterFor(taskId),
			enqueueTasks: (tasks, options) => this.enqueueTasks(tasks, options),
			getTaskData: (dependencyTaskId) => this.getTaskData(dependencyTaskId),
		};
	}

	/**
	 * Validate task ids, dependencies and detect cycles.
	 * @throws Error when validation fails.
	 */
	private validateTasks() {
		const idSet = new Set<string>();
		for (const task of this.tasks) {
			if (!task.id?.trim()) {
				throw new Error("Task id is required.");
			}
			if (idSet.has(task.id)) {
				throw new Error(`Duplicated task id: ${task.id}`);
			}
			idSet.add(task.id);
		}

		for (const task of this.tasks) {
			for (const dependencyId of task.dependencies) {
				if (!idSet.has(dependencyId)) {
					throw new Error(
						`Task ${task.id} has unknown dependency: ${dependencyId}`
					);
				}
				if (dependencyId === task.id) {
					throw new Error(`Task ${task.id} cannot depend on itself.`);
				}
			}
		}

		const visiting = new Set<string>();
		const visited = new Set<string>();

		const dfs = (taskId: string) => {
			if (visiting.has(taskId)) {
				throw new Error(`Cycle detected involving task: ${taskId}`);
			}
			if (visited.has(taskId)) return;

			visiting.add(taskId);
			const task = this.getTaskById(taskId);
			for (const dependencyId of task?.dependencies ?? []) {
				dfs(dependencyId);
			}
			visiting.delete(taskId);
			visited.add(taskId);
		};

		for (const task of this.tasks) {
			dfs(task.id);
		}
	}

	/**
	 * Mark all descendant tasks of a failed task as blocked.
	 * @param failedTaskId - Id of the task that failed.
	 */
	private markDescendantsBlocked(failedTaskId: string) {
		const blocked = new Set<string>();
		const queue = [failedTaskId];

		while (queue.length > 0) {
			const current = queue.shift();
			if (!current) continue;

			for (const task of this.tasks) {
				if (task.dependencies.includes(current) && !blocked.has(task.id)) {
					blocked.add(task.id);
					queue.push(task.id);
				}
			}
		}

		for (const taskId of blocked) {
			const task = this.getTaskById(taskId);
			if (!task || task.status !== "pending") continue;
			task.status = "blocked";
			task.error = `Blocked by failed dependency: ${failedTaskId}`;
			task.endedAt = Date.now();
		}
	}

	/**
	 * Get tasks that are ready to run (pending and all dependencies done).
	 * @returns Array of ready tasks.
	 */
	private getReadyTasks(): Task<TMap>[] {
		return this.tasks.filter((task) => {
			if (task.status !== "pending") return false;
			return task.dependencies.every(
				(dependencyId) => this.getTaskById(dependencyId)?.status === "done"
			);
		});
	}

	/**
	 * Execute an IA task using chat completions and optionally stream tokens.
	 * @param task - The IaTask to run.
	 */
	private async runIaTask(
		task: IaTask<TMap>,
		options?: TaskRunOptions
	): Promise<void> {
		const runtime = this.runtimeFor(task.id);
		const runResultRaw = task.run ? await task.run(runtime) : "";
		const runResult = String(runResultRaw ?? "").trim();
		const userContent = runResult
			? `context: ${runResult} ${task.userMessage}`
			: task.userMessage;
		const useStream =
			options?.stream !== undefined
				? options.stream === true
				: task.completionOptions.stream === true;
		const request: LlamaChatCompletionsRequest = {
			...task.completionOptions,
			stream: useStream,
			messages: [
				{ role: "system", content: task.systemMessage },
				{ role: "user", content: userContent },
			],
		};

		const response = await chatCompletions(
			request,
			useStream
				? {
						onToken: (chunk: string) => {
							const currentData = this.getTaskData(task.id) || "";
							this.setTaskFields(task.id, {
								data: (currentData + chunk) as TMap[keyof TMap & string],
							});
						},
					}
				: undefined
		);

		const message = response.choices?.[0]?.message;
		const text = collectAssistantText(message?.content ?? null);
		this.setTaskFields(task.id, { data: text as TMap[keyof TMap & string] });
	}

	/**
	 * Run a script task, passing dependency data and an updater.
	 * @param task - Script task to execute.
	 * @returns The task result (assigned to task.data).
	 */
	private async runScriptTask(
		task: Extract<Task<TMap>, { type: "script" }>
	): Promise<void> {
		const result = await task.run(this.runtimeFor(task.id));
		this.setTaskFields(task.id, { data: result });
	}

	/**
	 * Execute a task (IA or script), updating status and timestamps.
	 * @param task - Task to execute.
	 * @throws Will rethrow errors from task execution.
	 */
	private async executeTask(
		task: Task<TMap>,
		options?: TaskRunOptions
	): Promise<void> {
		this.setTaskFields(task.id, {
			status: "running",
			startedAt: Date.now(),
			error: undefined,
		});

		try {
			if (task.type === "ia") {
				await this.runIaTask(task, options);
			} else {
				await this.runScriptTask(task);
			}

			this.setTaskFields(task.id, {
				status: "done",
				endedAt: Date.now(),
			});
		} catch (error) {
			const formattedError = formatTaskExecutionError(error);
			this.setTaskFields(task.id, {
				status: "failed",
				error: formattedError.message,
				debug: formattedError.debug,
				endedAt: Date.now(),
			});
			throw error;
		}
	}

	/**
	 * Count tasks in a given status.
	 * @param status - The status to count.
	 * @returns Number of tasks with the provided status.
	 */
	private countStatus(status: TaskStatus): number {
		return this.tasks.filter((task) => task.status === status).length;
	}

	/**
	 * Execute the scheduler loop and update lastRun.
	 * @param options - Execution controls.
	 * @returns Summary of the run.
	 */
	private async executeRunLoop(
		options?: TaskRunOptions
	): Promise<TaskRunSummary<TMap>> {
		this.running = true;
		this.pendingTasksQueue = [];
		this.restartRequested = false;

		const startedAt = Date.now();
		let failedTaskId: string | undefined;

		try {
			while (true) {
				this.flushQueuedTasks();

				if (this.restartRequested) {
					this.restartRequested = false;
					this.resetStatuses({ Rebuild: true });
					continue;
				}

				const ready = this.getReadyTasks();
				if (ready.length === 0) break;

				const readyScripts = ready.filter((task) => task.type === "script");
				if (readyScripts.length > 0) {
					const results = await Promise.allSettled(
						readyScripts.map((task) => this.executeTask(task, options))
					);
					const failedIndex = results.findIndex(
						(result) => result.status === "rejected"
					);

					if (failedIndex !== -1) {
						failedTaskId = readyScripts[failedIndex]?.id;
						if (failedTaskId) {
							this.markDescendantsBlocked(failedTaskId);
						}
						break;
					}
					continue;
				}

				const nextIa = ready.find((task) => task.type === "ia");
				if (!nextIa) break;

				try {
					await this.executeTask(nextIa, options);
				} catch {
					failedTaskId = nextIa.id;
					this.markDescendantsBlocked(nextIa.id);
					break;
				}
			}
		} finally {
			this.running = false;
			const endedAt = Date.now();

			this.lastRun = {
				startedAt,
				endedAt,
				tasks: this.snapshotTasks(),
				total: this.tasks.length,
				done: this.countStatus("done"),
				failed: this.countStatus("failed"),
				blocked: this.countStatus("blocked"),
				pending: this.countStatus("pending"),
				...(failedTaskId ? { failedTaskId } : {}),
			};
		}

		return this.lastRun;
	}

	/**
	 * Run the task runner: validate tasks, run ready tasks in correct order and update lastRun.
	 * @param options - Execution controls such as rebuilding completed tasks.
	 * @returns Summary of the run.
	 */
	async run(options?: TaskRunOptions): Promise<TaskRunSummary<TMap>> {
		if (this.running) {
			throw new Error("Task runner is already running.");
		}

		const runOptions = { Rebuild: false, ...options };

		this.validateTasks();
		this.resetStatuses(runOptions);

		return this.executeRunLoop(runOptions);
	}

	/**
	 * Re-run a task after patching its parameters, invalidating its descendants.
	 * @param taskId - Task id to re-run.
	 * @param patch - Editable task fields to override before the run.
	 * @param options - Execution controls.
	 * @returns Summary of the run.
	 */
	async rerunTask(
		taskId: keyof TMap & string,
		patch?: TaskRerunPatch<TMap>,
		options?: TaskRerunOptions
	): Promise<TaskRunSummary<TMap>> {
		if (this.running) {
			throw new Error("Task runner is already running.");
		}

		this.validateTasks();

		const task = this.getTaskById(taskId);
		if (!task) {
			throw new Error(`Task not found: ${taskId}`);
		}

		this.patchTask(taskId, patch);

		const affectedTaskIds = [taskId, ...this.getDescendantTaskIds(taskId)];
		this.resetTaskIds(affectedTaskIds);

		return this.executeRunLoop({ Rebuild: false, ...options });
	}
}

export function createTaskRunner<TMap extends TaskMapBase = TaskMapBase>(
	id?: string
) {
	return new TaskRunnerStore<TMap>(id);
}
