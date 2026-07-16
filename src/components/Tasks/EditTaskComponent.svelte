<script lang="ts">
	import type { IaTask, Task, TaskComponentProps, TaskRerunPatch } from '@/types/taskRunner.types';
	import Spacer from '@/components/Spacer.component.svelte';
	import CompletionOptionsEditor from '@/components/inputs/CompletionOptionsEditor.svelte';
	import Checkbox from '@/components/inputs/Checkbox.component.svelte';
	import { workflowManager } from '@/runners/workflowManager.svelte';
	import { workflowStore } from '@/stores/workflowStore.svelte';

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

	let localCompletionOptions = $state<Record<string, unknown>>({});
	let localSystemMessage = $state('');
	let localUserMessage = $state('');

	$effect(() => {
		if (isEditableIa) {
			const iaTask = _task as IaTask;
			localCompletionOptions = { ...iaTask.completionOptions };
			localSystemMessage = iaTask.systemMessage ?? '';
			localUserMessage = iaTask.userMessage ?? '';
		}
	});

	function handleSave() {
		if (!targetRunId || !isEditableIa) return;
		const iaTask = _task as IaTask;
		const patch: Record<string, unknown> = {};

		if (JSON.stringify(localCompletionOptions) !== JSON.stringify(iaTask.completionOptions)) {
			patch.completionOptions = localCompletionOptions;
		}
		if (localSystemMessage !== iaTask.systemMessage) {
			patch.systemMessage = localSystemMessage;
		}
		if (localUserMessage !== iaTask.userMessage) {
			patch.userMessage = localUserMessage;
		}

		if (Object.keys(patch).length === 0) return;
		void workflowManager.rerunTask(targetRunId, _task.id, patch as TaskRerunPatch);
	}

	function handleCancel() {
		if (!targetRunId) return;
		workflowManager.addTask(targetRunId, { ..._task, status: 'done' });
	}

	void _componentProps;
</script>

<div class="edit-task">
	<label>
		<span>System message</span>
		<textarea bind:value={localSystemMessage} rows="5"></textarea>
	</label>

	<label>
		<span>User message</span>
		<textarea bind:value={localUserMessage} rows="4"></textarea>
	</label>

	<Checkbox
		id="edit-stream"
		label="Stream"
		checked={localCompletionOptions['stream'] === true}
		onChange={(v) => (localCompletionOptions['stream'] = v)}
	/>

	<Spacer title="Completion Options" defaultOpen={false}>
		<div class="form-grid">
			<CompletionOptionsEditor completionOptions={localCompletionOptions} showStream={false} />
		</div>
	</Spacer>

	<div class="actions">
		<button class="btn btn-cancel" onclick={handleCancel}>Cancel</button>
		<button class="btn btn-save" onclick={handleSave}>Save</button>
	</div>
</div>

<style>
	.edit-task {
		width: 100%;
		display: grid;
		gap: 0.75rem;
	}

	.form-grid {
		display: grid;
		gap: 0.75rem;
	}

	label {
		display: grid;
		gap: 0.35rem;
	}

	label span {
		opacity: 0.82;
		font-size: 0.85rem;
	}

	textarea {
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 14px;
		background: rgba(255, 255, 255, 0.04);
		padding: 0.7rem 0.85rem;
		width: 100%;
		color: inherit;
		font: inherit;
		box-sizing: border-box;
		resize: vertical;
		font-family: 'CaskaydiaCove NFM Light', monospace;
		line-height: 1.45;
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
</style>
