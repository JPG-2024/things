<script lang="ts">
	import { workflowManager } from '@/runners/workflowManager.svelte';
	import { workflowStore } from '@/stores/workflowStore.svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import Modal from '@/components/Modal.svelte';
	import Spacer from '@/components/Spacer.component.svelte';
	import Pill from '@/components/Pill.svelte';
	import Icon from '@/components/Icon.svelte';
	import { topologicalSortTasks } from '@/lib/utils/tasks/topologicalSortTasks';
	import { createIaTask, createExtractorTask, buildTask } from '@/runners/shared/dynamicTasks';
	import type { Task, TaskStatus } from '@/types/taskRunner.types';

	let formMode = $state<'ia' | 'extractor' | null>(null);
	let newTaskId = $state('');
	let newTaskName = $state('');
	let newTaskUserMessage = $state('');
	let newTaskSystemMessage = $state('');
	let newTaskCount = $state(5);
	let selectedDependencies = $state<string[]>([]);
	let selectedDependencyId = $state('');
	let selectedDependencyForTask = $state<Record<string, string>>({});
	let formError = $state('');

	const targetRunId = $derived(workflowStore.focusedRunId ?? workflowStore.stackedRunIds[0]);
	const tasks = $derived(targetRunId ? (workflowManager.getTasks(targetRunId) ?? []) : []);
	const orderedTasks = $derived(topologicalSortTasks(tasks));
	const allTaskIds = $derived(tasks.map((task) => task.id));
	const isRunning = $derived(targetRunId ? workflowStore.isRunRunning(targetRunId) : false);

	function resetForm() {
		newTaskId = '';
		newTaskName = '';
		newTaskUserMessage = '';
		newTaskSystemMessage = '';
		newTaskCount = 5;
		selectedDependencies = [];
		selectedDependencyId = '';
		formError = '';
	}

	function statusToPillStatus(status?: TaskStatus): 'idle' | 'loading' | 'done' | 'error' {
		switch (status) {
			case 'running':
				return 'loading';
			case 'done':
				return 'done';
			case 'failed':
			case 'blocked':
				return 'error';
			default:
				return 'idle';
		}
	}

	function isExtractorTask(task: Task): boolean {
		return task.type === 'ia' && task.extractorConfig !== undefined;
	}

	function availableDependencies(excludeIds: string[]): string[] {
		return allTaskIds.filter((id) => !excludeIds.includes(id));
	}

	function addDependency() {
		if (!selectedDependencyId) return;
		if (formMode === 'extractor') {
			selectedDependencies = [selectedDependencyId];
		} else if (!selectedDependencies.includes(selectedDependencyId)) {
			selectedDependencies = [...selectedDependencies, selectedDependencyId];
		}
		selectedDependencyId = '';
	}

	function removeDependency(dep: string) {
		selectedDependencies = selectedDependencies.filter((d) => d !== dep);
	}

	function validateNewTask(): string | null {
		const id = newTaskId.trim();
		if (!id) return 'Task id is required.';
		if (allTaskIds.includes(id)) return `Task id "${id}" already exists.`;
		if (id === selectedDependencies.find((dep) => dep === id)) {
			return 'A task cannot depend on itself.';
		}
		if (!newTaskUserMessage.trim()) return 'User message is required.';
		if (formMode === 'extractor' && selectedDependencies.length === 0) {
			return 'Extractor tasks need one source dependency.';
		}
		return null;
	}

	function handleAddTask() {
		formError = '';
		if (!targetRunId) {
			formError = 'No active workflow run.';
			return;
		}
		if (!formMode) {
			formError = 'Select a task type first.';
			return;
		}

		const error = validateNewTask();
		if (error) {
			formError = error;
			return;
		}

		const id = newTaskId.trim();
		const name = newTaskName.trim() || undefined;
		const dependencies = [...selectedDependencies];

		const def =
			formMode === 'extractor'
				? createExtractorTask({
						name,
						dependencies,
						description: newTaskUserMessage.trim(),
						count: Math.max(1, newTaskCount)
					})
				: createIaTask({
						name,
						dependencies,
						systemMessage: newTaskSystemMessage.trim() || undefined,
						userMessage: newTaskUserMessage.trim()
					});

		const task = buildTask(def, id);

		workflowManager.addTask(targetRunId, task);
		resetForm();
	}

	function handleRemoveTask(taskId: string) {
		if (!targetRunId) return;
		workflowManager.removeTask(targetRunId, taskId);
	}

	function updateTaskDependency(task: Task, dep: string, add: boolean) {
		if (!targetRunId) return;
		let nextDeps: string[];
		if (add) {
			if (dep === task.id || task.dependencies.includes(dep)) return;
			nextDeps = isExtractorTask(task) ? [dep] : [...task.dependencies, dep];
		} else {
			nextDeps = task.dependencies.filter((d) => d !== dep);
		}
		workflowManager.addTask(targetRunId, { ...task, dependencies: nextDeps });
	}

	function addDependencyToTask(task: Task) {
		const dep = selectedDependencyForTask[task.id];
		if (!dep) return;
		updateTaskDependency(task, dep, true);
		selectedDependencyForTask = { ...selectedDependencyForTask, [task.id]: '' };
	}

	function runTarget() {
		if (!targetRunId || isRunning) return;
		void workflowManager.run(targetRunId).catch((error) => {
			console.error('Workflow run failed', error);
		});
	}

	function handleClose() {
		viewState.showAllTasks = false;
		runTarget();
	}

	$effect(() => {
		if (formMode === 'extractor' && selectedDependencies.length > 1) {
			selectedDependencies = [selectedDependencies[0] ?? ''];
		}
	});
</script>

<Modal show={viewState.showAllTasks} onClose={handleClose}>
	<div class="editor-shell">
		<header class="editor-header">
			<div>
				<p class="eyebrow">Task workflow editor</p>
				<h2>{targetRunId ?? 'No active run'}</h2>
			</div>
			{#if isRunning}
				<Pill status="loading" text="running" />
			{/if}
		</header>

		{#if targetRunId}
			<section class="add-task-section">
				<div class="mode-toggle">
					<button
						class="mode-button"
						class:active={formMode === 'ia'}
						onclick={() => (formMode = 'ia')}
						disabled={isRunning}
					>
						<Icon name="Brain" size={16} />
						<span>IA task</span>
					</button>
					<button
						class="mode-button"
						class:active={formMode === 'extractor'}
						onclick={() => (formMode = 'extractor')}
						disabled={isRunning}
					>
						<Icon name="ListTree" size={16} />
						<span>Extractor</span>
					</button>
				</div>

				{#if formMode}
					<div class="form-grid">
						<label>
							<span>ID</span>
							<input
								bind:value={newTaskId}
								type="text"
								placeholder="task-id"
								disabled={isRunning}
							/>
						</label>

						<label>
							<span>Name</span>
							<input
								bind:value={newTaskName}
								type="text"
								placeholder="Optional display name"
								disabled={isRunning}
							/>
						</label>

						<div class="dependencies-field">
							<span>Dependencies</span>
							<div class="dependency-input">
								<select bind:value={selectedDependencyId} disabled={isRunning}>
									<option value="">Select dependency</option>
									{#each availableDependencies( [newTaskId.trim(), ...selectedDependencies] ) as dep (dep)}
										<option value={dep}>{dep}</option>
									{/each}
								</select>
								<button
									class="add-dep-button"
									onclick={addDependency}
									disabled={!selectedDependencyId || isRunning}
								>
									Add
								</button>
							</div>
							{#if selectedDependencies.length > 0}
								<div class="dependency-pills">
									{#each selectedDependencies as dep (dep)}
										<span class="dep-pill">
											<Pill status="idle" text={dep} tag />
											<button
												class="remove-dep"
												onclick={() => removeDependency(dep)}
												disabled={isRunning}
												aria-label="Remove dependency"
											>
												×
											</button>
										</span>
									{/each}
								</div>
							{/if}
						</div>

						{#if formMode === 'ia'}
							<label>
								<span>System message</span>
								<textarea
									bind:value={newTaskSystemMessage}
									rows="3"
									placeholder="Optional system prompt"
									disabled={isRunning}
								></textarea>
							</label>
						{/if}

						<label>
							<span>User message</span>
							<textarea
								bind:value={newTaskUserMessage}
								rows="3"
								placeholder="What should the task produce?"
								disabled={isRunning}
							></textarea>
						</label>

						{#if formMode === 'extractor'}
							<label>
								<span>Count</span>
								<input bind:value={newTaskCount} type="number" min="1" disabled={isRunning} />
							</label>
						{/if}

						{#if formError}
							<p class="error">{formError}</p>
						{/if}

						<button class="add-task-button" onclick={handleAddTask} disabled={isRunning}>
							Add task
						</button>
					</div>
				{/if}
			</section>

			<section class="task-list">
				{#if orderedTasks.length === 0}
					<p class="hint">No tasks yet. Add one above or run a routine.</p>
				{:else}
					{#each orderedTasks as task (task.id)}
						<Spacer title={task.id} defaultOpen={false}>
							<div class="task-body">
								<div class="task-meta">
									<Pill
										status={statusToPillStatus(task.status)}
										text={task.status ?? 'pending'}
										tag
									/>
									<span class="meta-item">{task.type}</span>
									{#if task.name}
										<span class="meta-item">{task.name}</span>
									{/if}
									{#if task.component}
										<span class="meta-item">{task.component}</span>
									{/if}
								</div>

								<div class="dependencies-field">
									<span>Dependencies</span>
									{#if task.dependencies.length > 0}
										<div class="dependency-pills">
											{#each task.dependencies as dep (dep)}
												<span class="dep-pill">
													<Pill status="idle" text={dep} tag />
													<button
														class="remove-dep"
														onclick={() => updateTaskDependency(task, dep, false)}
														disabled={isRunning}
														aria-label="Remove dependency"
													>
														×
													</button>
												</span>
											{/each}
										</div>
									{:else}
										<p class="hint">No dependencies</p>
									{/if}

									<div class="dependency-input">
										<select bind:value={selectedDependencyForTask[task.id]} disabled={isRunning}>
											<option value="">Select dependency</option>
											{#each availableDependencies([task.id, ...task.dependencies]) as dep (dep)}
												<option value={dep}>{dep}</option>
											{/each}
										</select>
										<button
											class="add-dep-button"
											onclick={() => addDependencyToTask(task)}
											disabled={!selectedDependencyForTask[task.id] || isRunning}
										>
											Add
										</button>
									</div>
								</div>

								<button
									class="remove-task-button"
									onclick={() => handleRemoveTask(task.id)}
									disabled={isRunning}
								>
									<Icon name="Trash2" size={16} />
									<span>Remove task</span>
								</button>
							</div>
						</Spacer>
					{/each}
				{/if}
			</section>
		{:else}
			<p class="hint">No active workflow run to edit.</p>
		{/if}

		{#if isRunning}
			<p class="hint">Editing is disabled while the workflow is running.</p>
		{/if}
	</div>
</Modal>

<style>
	.editor-shell {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		padding: 1rem;
		max-width: 900px;
		margin: 0 auto;
		color: white;
	}

	.editor-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 1rem;
	}

	.eyebrow {
		margin: 0 0 0.25rem;
		opacity: 0.7;
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	h2,
	p {
		margin: 0;
	}

	.add-task-section {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1rem;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 16px;
		background: rgba(255, 255, 255, 0.03);
	}

	.mode-toggle {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.mode-button {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.5rem 1rem;
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.04);
		color: inherit;
		cursor: pointer;
		font: inherit;
		font-size: 0.9rem;
	}

	.mode-button.active {
		background: rgba(255, 255, 255, 0.12);
		border-color: rgba(255, 255, 255, 0.35);
	}

	.mode-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.form-grid {
		display: grid;
		gap: 1rem;
	}

	label {
		display: grid;
		gap: 0.45rem;
	}

	label span,
	.dependencies-field > span {
		opacity: 0.82;
		font-size: 0.9rem;
	}

	input,
	select,
	textarea {
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 14px;
		background: rgba(255, 255, 255, 0.04);
		padding: 0.75rem 1rem;
		color: inherit;
		font: inherit;
		box-sizing: border-box;
	}

	select {
		appearance: none;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
		background-repeat: no-repeat;
		background-position: right 0.75rem center;
		padding-right: 2.5rem;
	}

	textarea {
		resize: vertical;
		min-height: 5rem;
		font-family: 'CaskaydiaCove NFM Light', monospace;
		line-height: 1.45;
	}

	.dependencies-field {
		display: grid;
		gap: 0.45rem;
	}

	.dependency-input {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.dependency-input select {
		flex: 1;
	}

	.add-dep-button,
	.add-task-button,
	.remove-task-button {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		padding: 0.6rem 1rem;
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 12px;
		background: rgba(255, 255, 255, 0.06);
		color: inherit;
		font: inherit;
		font-size: 0.9rem;
		cursor: pointer;
		transition: background 0.2s ease;
	}

	.add-dep-button:disabled,
	.add-task-button:disabled,
	.remove-task-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.add-task-button {
		justify-self: start;
	}

	.remove-task-button {
		width: max-content;
		background: rgba(239, 68, 68, 0.1);
		border-color: rgba(239, 68, 68, 0.3);
	}

	.dependency-pills {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
	}

	.dep-pill {
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
	}

	.remove-dep {
		background: none;
		border: none;
		color: rgba(255, 255, 255, 0.7);
		cursor: pointer;
		font-size: 1rem;
		line-height: 1;
		padding: 0.1rem 0.3rem;
	}

	.remove-dep:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.task-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.task-body {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 0.5rem 0 1rem;
	}

	.task-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
	}

	.meta-item {
		font-size: 0.85rem;
		opacity: 0.8;
	}

	.hint {
		opacity: 0.7;
		font-size: 0.9rem;
	}

	.error {
		color: #ff8f8f;
		margin: 0;
	}
</style>
