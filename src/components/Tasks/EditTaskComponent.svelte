<script lang="ts">
	import type { IaTask, Task, TaskComponentProps, TaskRerunPatch } from '@/types/taskRunner.types';
	import Spacer from '@/components/Spacer.component.svelte';
	import CompletionOptionsEditor from '@/components/inputs/CompletionOptionsEditor.svelte';
	import Checkbox from '@/components/inputs/Checkbox.component.svelte';
	import { workflowManager } from '@/runners/workflowManager.svelte';
	import { workflowStore } from '@/stores/workflowStore.svelte';
	import Input from '@/components/inputs/Input.component.svelte';
	import Textarea from '@/components/inputs/Textarea.component.svelte';

	type Props = {
		task: Task;
		runId?: string;
		componentProps?: TaskComponentProps;
	};

	let {
		task: _task,
		runId: _runId = undefined,
		componentProps: _componentProps = {}
	}: Props = $props();

	const isIaTask = $derived(_task.type === 'ia');
	const isEditableIa = $derived(isIaTask && !(_task as IaTask).extractorConfig);
	const targetRunId = $derived(_runId ?? workflowStore.focusedRunId);

	let editedTask = $state<IaTask>(_task as IaTask);
	let localRenderOrder = $state('');
	let originalCompletionOptions = $state('');
	let originalSystemMessage = $state('');
	let originalUserMessage = $state('');
	let originalRenderOrder = $state<number | undefined>(undefined);

	$effect(() => {
		if (isEditableIa) {
			const iaTask = _task as IaTask;
			editedTask = { ...iaTask, completionOptions: { ...iaTask.completionOptions } } as IaTask;
			localRenderOrder = iaTask.renderOrder != null ? String(iaTask.renderOrder) : '';
			originalCompletionOptions = JSON.stringify(iaTask.completionOptions);
			originalSystemMessage = iaTask.systemMessage ?? '';
			originalUserMessage = iaTask.userMessage ?? '';
			originalRenderOrder = iaTask.renderOrder;
		}
	});

	function handleSave() {
		if (!targetRunId || !isEditableIa) return;
		const patch: Record<string, unknown> = {};

		if (JSON.stringify(editedTask.completionOptions) !== originalCompletionOptions) {
			patch.completionOptions = editedTask.completionOptions;
		}
		if (editedTask.systemMessage !== originalSystemMessage) {
			patch.systemMessage = editedTask.systemMessage;
		}
		if (editedTask.userMessage !== originalUserMessage) {
			patch.userMessage = editedTask.userMessage;
		}
		const editedRenderOrder = localRenderOrder !== '' ? Number(localRenderOrder) : undefined;
		if (editedRenderOrder !== originalRenderOrder) {
			patch.renderOrder = editedRenderOrder;
		}

		if (Object.keys(patch).length === 0) return;
		void workflowManager.rerunTask(targetRunId, _task.id, patch as TaskRerunPatch);
	}

	function handleCancel() {
		if (!targetRunId) return;
		workflowManager.addTask(targetRunId, { ..._task, status: 'done' });
	}

	function handleDelete() {
		if (!targetRunId) return;
		workflowManager.removeTask(targetRunId, _task.id);
	}

	void _componentProps;
</script>

<div class="edit-task">
	<Textarea bind:value={editedTask.systemMessage} rows={5} label="System message" />

	<Textarea bind:value={editedTask.userMessage} rows={4} label="User message" />

	<Checkbox
		id="edit-stream"
		label="Stream"
		checked={editedTask.completionOptions?.stream === true}
		onChange={(v) => (editedTask.completionOptions.stream = v)}
	/>

	<Input id="render-order" bind:value={localRenderOrder} label="Render order" />

	<Spacer title="Completion Options" defaultOpen={false}>
		<div class="form-grid">
			<CompletionOptionsEditor
				completionOptions={editedTask.completionOptions}
				showStream={false}
			/>
		</div>
	</Spacer>

	<div class="actions">
		<button class="btn btn-delete" onclick={handleDelete}>Delete</button>
		<button class="btn btn-cancel" onclick={handleCancel}>Cancel</button>
		<button class="btn btn-save" onclick={handleSave}>Save</button>
	</div>
</div>

<style>
	.edit-task {
		width: 100%;
		display: grid;
		gap: 0.75rem;
		border: 1px solid rgba(255, 255, 0, 0.169);
		padding: 1rem;
		border-radius: 3pxno;
	}

	.form-grid {
		display: grid;
		gap: 0.75rem;
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		padding-top: 0.25rem;
	}

	.btn {
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 999px;
		padding: 0.45rem 1.1rem;
		font: inherit;
		font-size: 0.82rem;
		cursor: pointer;
		transition:
			background 0.2s ease,
			border-color 0.2s ease;
	}

	.btn-cancel {
		background: rgba(255, 255, 255, 0.04);
		color: inherit;
	}

	.btn-cancel:hover {
		background: rgba(255, 255, 255, 0.08);
		border-color: rgba(255, 255, 255, 0.3);
	}

	.btn-save {
		background: var(--primary-color, #7c6af7);
		border-color: var(--primary-color, #7c6af7);
		color: white;
	}

	.btn-save:hover {
		opacity: 0.9;
	}

	.btn-delete {
		background: rgba(220, 53, 69, 0.1);
		border-color: rgba(220, 53, 69, 0.4);
		color: #dc3545;
	}

	.btn-delete:hover {
		background: rgba(220, 53, 69, 0.2);
		border-color: rgba(220, 53, 69, 0.6);
	}
</style>
