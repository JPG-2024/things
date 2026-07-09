<script lang="ts">
	import Modal from '@/components/Modal.svelte';
	import Spacer from '@/components/Spacer.component.svelte';
	import { workflowManager } from '@/runners/workflowManager.svelte';
	import { workflowStore } from '@/stores/workflowStore.svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import type { IaTask, Task } from '@/types/taskRunner.types';

	interface CompletionOptionsShape {
		temperature?: number;
		top_k?: number;
		top_p?: number;
		min_p?: number;
		n_predict?: number;
		max_tokens?: number;
		presence_penalty?: number;
		frequency_penalty?: number;
		seed?: number;
		stop?: string[];
		model?: string;
		stream?: boolean;
		grammar?: string;
	}

	interface EditableIaTask extends Task {
		type: 'ia';
		_editedSystemMessage: string;
		_editedUserMessage: string;
		_editedCompletionOptions: CompletionOptionsShape;
		_hasDynamicCompletionOptions: boolean;
		_hasDynamicSystemMessage: boolean;
		_hasDynamicUserMessage: boolean;
	}

	interface EditableScriptTask extends Task {
		type: 'script';
		_editedName: string;
		_editedGridSpan: number;
		_editedPersist: boolean;
	}

	type EditableTask = EditableIaTask | EditableScriptTask;

	interface Props {
		onClose: () => void;
	}

	let { onClose }: Props = $props();

	const focusedRunId = $derived(workflowStore.focusedRunId);
	const focusedRunTasks = $derived(workflowStore.focusedRunTasks as Task[]);

	let editedTasks = $state<EditableTask[]>([]);
	let initialized = $state(false);

	$effect(() => {
		if (focusedRunTasks.length > 0 && !initialized) {
			editedTasks = focusedRunTasks.map((task) => buildEditableTask(task)) as EditableTask[];
			initialized = true;
		}
	});

	$effect(() => {
		if (focusedRunTasks.length === 0 && initialized) {
			initialized = false;
			editedTasks = [];
		}
	});

	function buildEditableTask(task: Task): EditableTask {
		const base = { ...task, dependencies: [...(task.dependencies ?? [])] };

		if (task.type === 'ia') {
			const iaTask = task as IaTask;
			const hasDynamicCompletions = typeof iaTask.completionOptions === 'function';
			const completionsObj = hasDynamicCompletions
				? {}
				: ({ ...(iaTask.completionOptions as Record<string, unknown>) } as CompletionOptionsShape);

			return {
				...base,
				_editedSystemMessage:
					typeof iaTask.systemMessage === 'function' ? '' : String(iaTask.systemMessage ?? ''),
				_editedUserMessage:
					typeof iaTask.userMessage === 'function' ? '' : String(iaTask.userMessage ?? ''),
				_editedCompletionOptions: completionsObj,
				_hasDynamicCompletionOptions: hasDynamicCompletions,
				_hasDynamicSystemMessage: typeof iaTask.systemMessage === 'function',
				_hasDynamicUserMessage: typeof iaTask.userMessage === 'function'
			} as EditableIaTask;
		}

		return {
			...base,
			_editedName: task.name ?? '',
			_editedGridSpan: task.gridSpan ?? 1,
			_editedPersist: task.persist ?? false
		} as EditableScriptTask;
	}

	function applyEditsToTask(edited: EditableTask, original: Task): Task {
		if (edited.type === 'ia') {
			const iaEdited = edited as EditableIaTask;
			const iaOriginal = original as IaTask;

			const patched: IaTask = {
				...iaOriginal,
				dependencies: [...(original.dependencies ?? [])]
			};

			if (!iaEdited._hasDynamicSystemMessage) {
				patched.systemMessage = iaEdited._editedSystemMessage;
			}
			if (!iaEdited._hasDynamicUserMessage) {
				patched.userMessage = iaEdited._editedUserMessage;
			}
			if (!iaEdited._hasDynamicCompletionOptions && Object.keys(iaEdited._editedCompletionOptions).length > 0) {
				patched.completionOptions = {
					...(iaOriginal.completionOptions as Record<string, unknown>),
					...iaEdited._editedCompletionOptions
				} as IaTask['completionOptions'];
			}

			return patched as Task;
		}

		const scriptEdited = edited as EditableScriptTask;
		return {
			...original,
			dependencies: [...(original.dependencies ?? [])],
			name: scriptEdited._editedName || undefined,
			gridSpan: (scriptEdited._editedGridSpan || undefined) as 1 | 2 | 3 | undefined,
			persist: scriptEdited._editedPersist || undefined
		} as Task;
	}

	async function handleClose() {
		const runId = focusedRunId;
		if (!runId) {
			onClose();
			return;
		}

		const originalTasks = focusedRunTasks;
		const finalTasks = editedTasks.map((edited) => {
			const original = originalTasks.find((t) => t.id === edited.id);
			return original ? applyEditsToTask(edited, original) : (edited as unknown as Task);
		});

		try {
			await workflowManager.run(runId, finalTasks, { Rebuild: true });
		} catch (e) {
			console.error('Failed to rerun tasks:', e);
		}

		onClose();
	}

	function getOptionKeys(task: EditableIaTask): (keyof CompletionOptionsShape)[] {
		return (Object.keys(task._editedCompletionOptions) as (keyof CompletionOptionsShape)[]).filter(
			(k) => k !== 'grammar' && k !== 'stream'
		);
	}

	function optionLabel(key: keyof CompletionOptionsShape): string {
		const labels: Record<string, string> = {
			temperature: 'Temperature',
			top_k: 'Top K',
			top_p: 'Top P',
			min_p: 'Min P',
			n_predict: 'N Predict',
			max_tokens: 'Max Tokens',
			presence_penalty: 'Presence Penalty',
			frequency_penalty: 'Frequency Penalty',
			seed: 'Seed',
			stop: 'Stop (comma-separated)',
			model: 'Model'
		};
		return labels[key] ?? key;
	}

	function optionStep(key: keyof CompletionOptionsShape): string {
		if (key === 'temperature' || key === 'top_p' || key === 'min_p') return '0.05';
		if (key === 'presence_penalty' || key === 'frequency_penalty') return '0.1';
		return '1';
	}

	function isNumberOption(key: keyof CompletionOptionsShape): boolean {
		return key !== 'stop' && key !== 'model';
	}
</script>

<Modal show={true} onClose={handleClose}>
	<div class="tasks-editor">
		<h2 class="editor-title">Tasks Editor</h2>

		{#if editedTasks.length === 0}
			<p class="empty-state">No tasks available for editing.</p>
		{:else}
			{#each editedTasks as task (task.id)}
				<Spacer title={task.name ?? task.id} icon="Settings" defaultOpen={false}>
					<div class="task-editor-content">
						{#if task.type === 'ia'}
							{@const iaTask = task as EditableIaTask}

							{#if iaTask._hasDynamicSystemMessage}
								<p class="dynamic-notice">System message is dynamic (function-based) — not editable here.</p>
							{:else}
								<label class="field">
									<span class="field-label">System Message</span>
									<textarea
										class="field-textarea"
										bind:value={iaTask._editedSystemMessage}
										rows={4}
									></textarea>
								</label>
							{/if}

							{#if iaTask._hasDynamicUserMessage}
								<p class="dynamic-notice">User message is dynamic (function-based) — not editable here.</p>
							{:else}
								<label class="field">
									<span class="field-label">User Message</span>
									<textarea
										class="field-textarea"
										bind:value={iaTask._editedUserMessage}
										rows={4}
									></textarea>
								</label>
							{/if}

							{#if iaTask._hasDynamicCompletionOptions}
								<p class="dynamic-notice">Completion options are dynamic (function-based) — not editable here.</p>
							{:else}
								<fieldset class="completion-options">
									<legend>Completion Options</legend>
									<div class="options-grid">
										{#each getOptionKeys(iaTask) as key}
											<label class="field field-inline">
												<span class="field-label">{optionLabel(key)}</span>
												{#if isNumberOption(key)}
													<input
														type="number"
														class="field-input"
														step={optionStep(key)}
														bind:value={iaTask._editedCompletionOptions[key] as number}
													/>
												{:else if key === 'stop'}
													<input
														type="text"
														class="field-input"
														value={(iaTask._editedCompletionOptions[key] as string[])?.join(', ') ?? ''}
														oninput={(e) => {
															const val = (e.target as HTMLInputElement).value;
															(iaTask._editedCompletionOptions[key] as string[]) = val
																.split(',')
																.map((s) => s.trim())
																.filter(Boolean);
														}}
													/>
												{:else}
													<input
														type="text"
														class="field-input"
														bind:value={iaTask._editedCompletionOptions[key] as string}
													/>
												{/if}
											</label>
										{/each}
									</div>
								</fieldset>
							{/if}
						{:else}
							{@const scriptTask = task as EditableScriptTask}

							<label class="field">
								<span class="field-label">Name</span>
								<input type="text" class="field-input" bind:value={scriptTask._editedName} />
							</label>

							<label class="field field-inline">
								<span class="field-label">Grid Span</span>
								<select class="field-input" bind:value={scriptTask._editedGridSpan}>
									<option value={1}>1</option>
									<option value={2}>2</option>
									<option value={3}>3</option>
								</select>
							</label>

							<label class="field field-inline field-checkbox">
								<input type="checkbox" bind:checked={scriptTask._editedPersist} />
								<span class="field-label">Persist</span>
							</label>

							<p class="readonly-info">
								Dependencies: {scriptTask.dependencies.join(', ') || 'none'}
							</p>
						{/if}
					</div>
				</Spacer>
			{/each}
		{/if}
	</div>
</Modal>

<style>
	.tasks-editor {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 1rem;
		max-width: 700px;
		margin: 0 auto;
	}

	.editor-title {
		font-size: 1.3rem;
		font-weight: bold;
		margin-bottom: 0.5rem;
	}

	.empty-state {
		color: rgba(255, 255, 255, 0.5);
		text-align: center;
		padding: 2rem;
	}

	.dynamic-notice {
		color: rgba(255, 255, 255, 0.45);
		font-size: 0.85rem;
		font-style: italic;
		margin: 0.3rem 0;
	}

	.task-editor-content {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		padding: 0.8rem 0;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.field-inline {
		flex-direction: row;
		align-items: center;
		gap: 0.5rem;
	}

	.field-checkbox {
		flex-direction: row;
		align-items: center;
	}

	.field-label {
		font-size: 0.82rem;
		color: rgba(255, 255, 255, 0.7);
		font-weight: 500;
		min-width: 120px;
	}

	.field-input {
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 6px;
		color: white;
		padding: 0.4rem 0.6rem;
		font-size: 0.85rem;
		width: 100%;
		box-sizing: border-box;
	}

	.field-input:focus {
		outline: none;
		border-color: var(--primary-color);
	}

	select.field-input {
		width: auto;
		min-width: 80px;
	}

	.field-textarea {
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 6px;
		color: white;
		padding: 0.5rem 0.7rem;
		font-size: 0.85rem;
		width: 100%;
		box-sizing: border-box;
		resize: vertical;
		font-family: inherit;
	}

	.field-textarea:focus {
		outline: none;
		border-color: var(--primary-color);
	}

	.completion-options {
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 8px;
		padding: 0.8rem;
		margin-top: 0.3rem;
	}

	.completion-options legend {
		font-size: 0.85rem;
		color: rgba(255, 255, 255, 0.6);
		padding: 0 0.4rem;
	}

	.options-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: 0.5rem 1rem;
	}

	.readonly-info {
		font-size: 0.82rem;
		color: rgba(255, 255, 255, 0.4);
	}
</style>
