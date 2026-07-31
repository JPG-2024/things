export interface DependencyGraphValidation {
	valid: boolean;
	errors: string[];
}

export class DependencyGraph {
	private forward = new Map<string, Set<string>>();
	private reverse = new Map<string, Set<string>>();

	addTask(taskId: string, dependencies: string[] = []): void {
		this.forward.set(taskId, new Set(dependencies));
		for (const dep of dependencies) {
			this.ensureReverseEntry(dep).add(taskId);
		}
	}

	removeTask(taskId: string): void {
		const deps = this.forward.get(taskId);
		if (deps) {
			for (const dep of deps) {
				this.reverse.get(dep)?.delete(taskId);
			}
			this.forward.delete(taskId);
		}
		this.reverse.delete(taskId);
	}

	renameId(oldId: string, newId: string): void {
		if (oldId === newId) return;

		const deps = this.forward.get(oldId);
		this.forward.delete(oldId);
		if (deps) this.forward.set(newId, deps);

		for (const [, taskDeps] of this.forward) {
			if (taskDeps.has(oldId)) {
				taskDeps.delete(oldId);
				taskDeps.add(newId);
			}
		}

		const dependents = this.reverse.get(oldId);
		this.reverse.delete(oldId);
		if (dependents) this.reverse.set(newId, dependents);

		if (deps) {
			for (const dep of deps) {
				const depOf = this.reverse.get(dep);
				if (depOf) {
					depOf.delete(oldId);
					depOf.add(newId);
				}
			}
		}
	}

	setDependencies(taskId: string, dependencies: string[]): void {
		const oldDeps = this.forward.get(taskId);
		if (oldDeps) {
			for (const dep of oldDeps) {
				this.reverse.get(dep)?.delete(taskId);
			}
		}
		this.forward.set(taskId, new Set(dependencies));
		for (const dep of dependencies) {
			this.ensureReverseEntry(dep).add(taskId);
		}
	}

	getDependencies(taskId: string): string[] {
		return [...(this.forward.get(taskId) ?? [])];
	}

	getDependents(taskId: string): string[] {
		return [...(this.reverse.get(taskId) ?? [])];
	}

	getDescendants(taskId: string): string[] {
		const result: string[] = [];
		const visited = new Set<string>();
		const queue = [taskId];
		visited.add(taskId);

		while (queue.length > 0) {
			const current = queue.shift()!;
			const dependents = this.reverse.get(current);
			if (dependents) {
				for (const dep of dependents) {
					if (!visited.has(dep)) {
						visited.add(dep);
						result.push(dep);
						queue.push(dep);
					}
				}
			}
		}

		return result;
	}

	getAllTaskIds(): string[] {
		return [...this.forward.keys()];
	}

	buildFromTasks(tasks: { id: string; dependencies: string[] }[]): void {
		this.forward.clear();
		this.reverse.clear();
		for (const task of tasks) {
			this.addTask(task.id, task.dependencies);
		}
	}

	syncFromTasks(tasks: { id: string; dependencies: string[] }[]): void {
		this.forward.clear();
		this.reverse.clear();
		for (const task of tasks) {
			this.addTask(task.id, task.dependencies);
		}
	}

	validate(skipTaskIds?: ReadonlySet<string>): DependencyGraphValidation {
		const errors: string[] = [];
		const allIds = new Set(this.forward.keys());
		const skipped = skipTaskIds ?? new Set<string>();

		for (const [taskId, deps] of this.forward) {
			if (!taskId.trim()) {
				errors.push('Task id is required.');
			}
			if (skipped.has(taskId)) continue;
			for (const dep of deps) {
				if (dep === taskId) {
					errors.push(`Task ${taskId} cannot depend on itself.`);
				}
				if (!allIds.has(dep)) {
					errors.push(`Task ${taskId} has unknown dependency: ${dep}`);
				}
			}
		}

		const duplicateIds = new Set<string>();
		const seen = new Set<string>();
		for (const id of this.forward.keys()) {
			if (seen.has(id)) duplicateIds.add(id);
			seen.add(id);
		}
		for (const id of duplicateIds) {
			errors.push(`Duplicated task id: ${id}`);
		}

		if (this.detectCycle()) {
			const cycleTaskId = this.findCycleTaskId();
			errors.push(`Cycle detected involving task: ${cycleTaskId}`);
		}

		return { valid: errors.length === 0, errors };
	}

	private detectCycle(): boolean {
		const visiting = new Set<string>();
		const visited = new Set<string>();

		const dfs = (taskId: string): boolean => {
			if (visiting.has(taskId)) return true;
			if (visited.has(taskId)) return false;

			visiting.add(taskId);
			for (const dep of this.forward.get(taskId) ?? []) {
				if (dfs(dep)) return true;
			}
			visiting.delete(taskId);
			visited.add(taskId);
			return false;
		};

		for (const taskId of this.forward.keys()) {
			if (dfs(taskId)) return true;
		}
		return false;
	}

	private findCycleTaskId(): string {
		const visiting = new Set<string>();
		const visited = new Set<string>();

		const dfs = (taskId: string): string | null => {
			if (visiting.has(taskId)) return taskId;
			if (visited.has(taskId)) return null;

			visiting.add(taskId);
			for (const dep of this.forward.get(taskId) ?? []) {
				const cycle = dfs(dep);
				if (cycle) return cycle;
			}
			visiting.delete(taskId);
			visited.add(taskId);
			return null;
		};

		for (const taskId of this.forward.keys()) {
			const cycle = dfs(taskId);
			if (cycle) return cycle;
		}
		return 'unknown';
	}

	private ensureReverseEntry(id: string): Set<string> {
		let entry = this.reverse.get(id);
		if (!entry) {
			entry = new Set();
			this.reverse.set(id, entry);
		}
		return entry;
	}
}
