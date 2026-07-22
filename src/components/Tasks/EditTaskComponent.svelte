<script lang="ts">
	import type { IaTask, Task, TaskComponentProps, TaskRerunPatch } from '@/types/taskRunner.types';
	import Spacer from '@/components/Spacer.component.svelte';
	import CompletionOptionsEditor from '@/components/inputs/CompletionOptionsEditor.svelte';
	import Checkbox from '@/components/inputs/Checkbox.component.svelte';
	import ToggleIcon from '@/components/ToggleIcon.svelte';
	import { workflowManager } from '@/runners/workflowManager.svelte';
	import { workflowStore } from '@/stores/workflowStore.svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import Input from '@/components/inputs/Input.component.svelte';
	import Textarea from '@/components/inputs/Textarea.component.svelte';
	import Button from '@/components/inputs/Button.component.svelte';
	import { inferenceTitle } from '@/lib/utils/inference/helpers/inferenceTitle';

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

	let editedTask = $state<IaTask>({
		...(_task as IaTask),
		name: (_task as IaTask).name ?? '',
		enableTTS: (_task as IaTask).enableTTS ?? false
	});
	let localRenderOrder = $state('');
	let originalCompletionOptions = $state('');
	let originalSystemMessage = $state('');
	let originalUserMessage = $state('');
	let originalRenderOrder = $state<number | undefined>(undefined);
	let originalName = $state('');
	let originalEnableTTS = $state(false);

	$effect(() => {
		if (isEditableIa) {
			const iaTask = _task as IaTask;
			editedTask = {
				...iaTask,
				completionOptions: { ...iaTask.completionOptions },
				name: iaTask.name ?? '',
				enableTTS: iaTask.enableTTS ?? false
			} as IaTask;
			localRenderOrder = iaTask.renderOrder != null ? String(iaTask.renderOrder) : '';
			originalCompletionOptions = JSON.stringify(iaTask.completionOptions);
			originalSystemMessage = iaTask.systemMessage ?? '';
			originalUserMessage = iaTask.userMessage ?? '';
			originalRenderOrder = iaTask.renderOrder;
			originalName = iaTask.name ?? '';
			originalEnableTTS = iaTask.enableTTS ?? false;
		}
	});

	async function handleSave() {
		if (!targetRunId || !isEditableIa) return;

		/* 		if (editedTask.userMessage) {
			try {
				const title = await inferenceTitle(editedTask.userMessage, { emoji: false, words: 5 });
				if (title) editedTask.name = title;
			} catch {
				// inference failure should not block saving
			}
		} */

		const patch: Record<string, unknown> = {};

		if (editedTask.name !== originalName) {
			patch.name = editedTask.name;
		}
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
		if (editedTask.enableTTS !== originalEnableTTS) {
			patch.enableTTS = editedTask.enableTTS;
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
	<Input bind:value={editedTask.name} label="Task name" />

	<Textarea bind:value={editedTask.systemMessage} rows={5} label="System message" />

	<Textarea bind:value={editedTask.userMessage} rows={4} label="User message" />

	<Checkbox
		id="edit-stream"
		label="Stream"
		checked={editedTask.completionOptions?.stream === true}
		onChange={(v) => (editedTask.completionOptions.stream = v)}
	/>

	<div class="tts-toggle">
		<ToggleIcon
			name="Speech"
			bind:checked={editedTask.enableTTS}
			size={20}
			tooltipProps={{ content: 'auto speech' }}
		/>
		<span class="tts-hint" class:muted={!viewState.autoSpeechEnabled}>
			{viewState.autoSpeechEnabled ? 'auto speech enabled' : 'auto speech disabled globally'}
		</span>
	</div>

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
		<Button onClick={handleDelete}>Delete</Button>
		<Button onClick={handleCancel}>Cancel</Button>
		<Button onClick={handleSave}>Save</Button>
	</div>
</div>

<style>
	.edit-task {
		width: 100%;
		display: grid;
		gap: 0.75rem;
		border: 1px solid rgba(255, 255, 0, 0.169);
		padding: 1rem;
		border-radius: 15px;
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

	.tts-toggle {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.25rem 0;
	}

	.tts-hint {
		font-size: 0.8rem;
		color: var(--primary-color);
		opacity: 0.8;
	}

	.tts-hint.muted {
		opacity: 0.4;
	}
</style>
