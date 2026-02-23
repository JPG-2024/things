import { chatCompletions } from '@/lib/utils/llama-completions';
import type { LlamaChatCompletionsRequest } from '@/lib/utils/llama-completions';
import type {
	IaTask,
	Task,
	TaskDependencyState,
	TaskRunSummary,
	TaskStateUpdate,
	TaskStatus,
	TaskStatusUpdater,
} from '@/types/taskRunner.types';

function toErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === 'string') return error;
	try {
		return JSON.stringify(error);
	} catch {
		return 'Unknown error';
	}
}

function collectAssistantText(content: Task['data']): string {
	if (typeof content === 'string') return content;
	if (!Array.isArray(content)) return '';

	let text = '';
	for (const part of content) {
		if (part && typeof part === 'object' && 'type' in part && part.type === 'text' && 'text' in part) {
			const chunk = part.text;
			if (typeof chunk === 'string') text += chunk;
		}
	}

	return text;
}

class TaskRunnerStore {
	tasks = $state<Task[]>([]);
	running = $state(false);
	lastRun = $state<TaskRunSummary | undefined>(undefined);

	setTasks(tasks: Task[]) {
		this.tasks = tasks.map((task) => ({
			...task,
			dependencies: [...task.dependencies],
			status: task.status ?? 'pending',
			error: task.error,
			debug: task.debug,
		}));
	}

	upsertTask(task: Task) {
		const index = this.tasks.findIndex((item) => item.id === task.id);
		if (index === -1) {
			this.tasks = [
				...this.tasks,
				{
					...task,
					dependencies: [...task.dependencies],
					status: task.status ?? 'pending',
				},
			];
			return;
		}

		this.tasks[index] = {
			...task,
			dependencies: [...task.dependencies],
			status: task.status ?? this.tasks[index].status ?? 'pending',
		};
	}

	removeTask(taskId: string) {
		this.tasks = this.tasks.filter((task) => task.id !== taskId);
	}

	resetStatuses() {
		for (const task of this.tasks) {
			task.status = 'pending';
			task.error = undefined;
			task.startedAt = undefined;
			task.endedAt = undefined;
			task.debug = undefined;
		}
	}

	getTaskData(taskId: string): Task['data'] | undefined {
		return this.getTaskById(taskId)?.data;
	}

	private getTaskById(taskId: string): Task | undefined {
		return this.tasks.find((task) => task.id === taskId);
	}

	private getDependencyData(task: Task): TaskDependencyState {
		const state: TaskDependencyState = {};
		for (const dependencyId of task.dependencies) {
			const dependency = this.getTaskById(dependencyId);
			state[dependencyId] = dependency?.data;
		}
		return state;
	}

	private setTaskFields(taskId: string, patch: Partial<Task>) {
		const task = this.getTaskById(taskId);
		if (!task) return;
		Object.assign(task, patch);
	}

	private statusUpdaterFor(taskId: string): TaskStatusUpdater {
		return (update: TaskStateUpdate) => {
			this.setTaskFields(taskId, {
				...(update.data !== undefined ? { data: update.data } : {}),
				...(update.debug !== undefined ? { debug: update.debug } : {}),
			});
		};
	}

	private validateTasks() {
		const idSet = new Set<string>();
		for (const task of this.tasks) {
			if (!task.id?.trim()) {
				throw new Error('Task id is required.');
			}
			if (idSet.has(task.id)) {
				throw new Error(`Duplicated task id: ${task.id}`);
			}
			idSet.add(task.id);
		}

		for (const task of this.tasks) {
			for (const dependencyId of task.dependencies) {
				if (!idSet.has(dependencyId)) {
					throw new Error(`Task ${task.id} has unknown dependency: ${dependencyId}`);
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
			if (!task || task.status !== 'pending') continue;
			task.status = 'blocked';
			task.error = `Blocked by failed dependency: ${failedTaskId}`;
			task.endedAt = Date.now();
		}
	}

	private getReadyTasks(): Task[] {
		return this.tasks.filter((task) => {
			if (task.status !== 'pending') return false;
			return task.dependencies.every((dependencyId) => this.getTaskById(dependencyId)?.status === 'done');
		});
	}

	private async runIaTask(task: IaTask): Promise<void> {
		const dependencyState = this.getDependencyData(task);
		const request: LlamaChatCompletionsRequest = {
			...task.completionOptions,
			messages: [
				{ role: 'system', content: task.systemMessage },
				{ role: 'user', content: task.userMessage(dependencyState) },
			],
		};

		const response = await chatCompletions(
			request,
			task.baseUrl,
		);

		const message = response.choices?.[0]?.message;
		const text = collectAssistantText(message?.content ?? null);
		this.setTaskFields(task.id, { data: text });
	}

	private async runScriptTask(task: Extract<Task, { type: 'script' }>): Promise<void> {
		const dependencyState = this.getDependencyData(task);
		const result = await task.run(dependencyState, this.statusUpdaterFor(task.id));
		this.setTaskFields(task.id, { data: result });
	}

	private async executeTask(task: Task): Promise<void> {
		this.setTaskFields(task.id, {
			status: 'running',
			startedAt: Date.now(),
			error: undefined,
		});

		try {
			if (task.type === 'ia') {
				await this.runIaTask(task);
			} else {
				await this.runScriptTask(task);
			}

			this.setTaskFields(task.id, {
				status: 'done',
				endedAt: Date.now(),
			});
		} catch (error) {
			this.setTaskFields(task.id, {
				status: 'failed',
				error: toErrorMessage(error),
				endedAt: Date.now(),
			});
			throw error;
		}
	}

	private countStatus(status: TaskStatus): number {
		return this.tasks.filter((task) => task.status === status).length;
	}

	async run(): Promise<TaskRunSummary> {
		if (this.running) {
			throw new Error('Task runner is already running.');
		}

		this.validateTasks();
		this.resetStatuses();
		this.running = true;

		const startedAt = Date.now();
		let failedTaskId: string | undefined;

		try {
			while (true) {
				const ready = this.getReadyTasks();
				if (ready.length === 0) break;

				const readyScripts = ready.filter((task) => task.type === 'script');
				if (readyScripts.length > 0) {
					const results = await Promise.allSettled(readyScripts.map((task) => this.executeTask(task)));
					const failedIndex = results.findIndex((result) => result.status === 'rejected');

					if (failedIndex !== -1) {
						failedTaskId = readyScripts[failedIndex]?.id;
						if (failedTaskId) {
							this.markDescendantsBlocked(failedTaskId);
						}
						break;
					}
					continue;
				}

				const nextIa = ready.find((task) => task.type === 'ia');
				if (!nextIa) break;

				try {
					await this.executeTask(nextIa);
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
				total: this.tasks.length,
				done: this.countStatus('done'),
				failed: this.countStatus('failed'),
				blocked: this.countStatus('blocked'),
				pending: this.countStatus('pending'),
				...(failedTaskId ? { failedTaskId } : {}),
			};
		}

		return this.lastRun;
	}
}

export const taskRunner = new TaskRunnerStore();
