<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from '@/components/Icon.svelte';
	import Spacer from '@/components/Spacer.component.svelte';
	import DetailsPanel from '@/components/DetailsPanel.svelte';
	import { workflowManager } from '@/runners/workflowManager.svelte';
	import { workflowStore } from '@/stores/workflowStore.svelte';
	import Modal from '@/components/Modal.svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import LuminousText from '@/components/LuminousText.svelte';
	import Pill from '@/components/Pill.svelte';
	import { buildTask, createIaTask } from '@/runners/shared/taskFactories';
	import EditTaskComponent from '@/components/Tasks/EditTaskComponent.svelte';
	import Label from '@/components/inputs/Label.component.svelte';
	import KeyValuePanel from '@/components/KeyValuePanel.svelte';
	import type { Task, TaskComponentProps } from '@/types/taskRunner.types';
	import {
		statusToPillStatus,
		formatDuration,
		formatTimestamp,
		dataPreview,
		dataTypeLabel,
		formatData
	} from '@/lib/utils/tasks/taskStats';

	const TOOLBAR_ICON_SIZE = 20;

	type Props = {
		runId?: string;
		task: Task;
		children?: Snippet;
		componentProps?: TaskComponentProps;
	};

	let { runId = undefined, task, children, componentProps = {} }: Props = $props();

	const targetRunId = $derived(runId ?? workflowStore.focusedRunId);
	const spacerDefaultOpen = $derived(
		task.status === 'editing' || task.status === 'running' || task.status === 'failed'
	);
	const pillStatus = $derived(statusToPillStatus(task.status));

	let taskOpen = $state(false);
	let showEditModal = $state(false);
	let draftTask = $state<Task | null>(null);
	let createMode = $state(false);

	function handleRerun() {
		if (!targetRunId) return;
		void workflowManager.rerunTask(targetRunId, task.id).catch((error) => {
			console.error('Task rerun failed', error);
		});
	}

	function openTaskEdit() {
		createMode = false;
		draftTask = null;
		showEditModal = true;
	}

	function handleBranch() {
		if (!targetRunId) return;
		taskOpen = false;
		const def = createIaTask({
			dependencies: [task.id],
			userMessage: '',
			model: viewState.aiModel,
			renderOrder: (task.renderOrder ?? 0) + 0.01,
			persist: true
		});
		const newTask = buildTask(def, `${task.id} > ${Date.now()}`);
		newTask.status = 'editing';
		draftTask = newTask;
		createMode = true;
		showEditModal = true;
	}

	function handleDelete() {
		if (!targetRunId) return;
		workflowManager.removeTask(targetRunId, task.id);
	}

	function handleModalClose() {
		showEditModal = false;
		draftTask = null;
		createMode = false;
	}
</script>

<div class="task-shell">
	<Spacer opened={taskOpen} defaultOpen={spacerDefaultOpen}>
		{#snippet titleSlot()}
			<span class="task-title-with-status">
				<LuminousText mode={taskOpen ? 'on' : 'off'}>
					<span>{task.name ?? task.id}</span>
				</LuminousText>
				<div class="pill-container">
					<Pill status={pillStatus} text={task.status ?? 'pending'} showPoint />
				</div>
			</span>
		{/snippet}
		<div class="task-info">
			<div class="task-toolbar">
				<Icon
					name="RefreshCw"
					onClick={handleRerun}
					size={TOOLBAR_ICON_SIZE}
					color="var(--primary-color)"
					tooltipProps={{ content: 'Rerun task and descendants' }}
					class="task-action"
				/>
				<Icon
					name="SquarePen"
					onClick={openTaskEdit}
					size={TOOLBAR_ICON_SIZE}
					color="var(--primary-color)"
					tooltipProps={{ content: 'edit task' }}
					class="task-action"
				/>
				<Icon
					name="GitBranch"
					onClick={handleBranch}
					size={TOOLBAR_ICON_SIZE}
					color="var(--primary-color)"
					tooltipProps={{ content: 'New task from' }}
					class="task-action"
				/>
				<div class="delete-action">
					<Icon
						name="Trash"
						onClick={handleDelete}
						size={TOOLBAR_ICON_SIZE}
						color="var(--primary-color)"
						tooltipProps={{ content: 'delete task' }}
						class="task-action"
					/>
				</div>
			</div>

			<div class="task-stats">
				<KeyValuePanel
					row
					items={[
						{ key: 'id', value: task.id },
						{ key: 'type', value: task.type },
						{
							key: 'duration',
							value: formatDuration(
								task.startedAt && task.endedAt ? task.endedAt - task.startedAt : null
							)
						},
						{ key: 'dependencies', value: task.dependencies.join(', ') },
						...(task.renderOrder != null ? [{ key: 'renderOrder', value: task.renderOrder }] : []),
						...(task.component ? [{ key: 'component', value: task.component }] : [])
					]}
				/>

				{#if task.data != null}
					<div class="data-block-container">
						<DetailsPanel label="data:" hint={dataPreview(task.data)}>
							<pre class="result-data">{formatData(task.data)}</pre>
						</DetailsPanel>
					</div>
				{/if}

				{#if task.status === 'failed'}
					<div class="error-block">
						<p class="error-message">{task.error ?? 'Unknown error'}</p>
						{#if task.debug}
							<details class="debug-block">
								<summary>Debug</summary>
								<pre>{task.debug}</pre>
							</details>
						{/if}
					</div>
				{/if}
			</div>
		</div></Spacer
	>

	<div class="task-content">
		{@render children?.()}
	</div>
</div>

<Modal show={showEditModal} onClose={handleModalClose}>
	<div class="edit-modal">
		<div class="edit-modal-header">
			<p class="eyebrow">{createMode ? 'New task from' : 'Edit task'}</p>
			<h2>
				{(createMode && draftTask ? draftTask : task).name ??
					(createMode && draftTask ? draftTask : task).id}
			</h2>
			<p class="edit-modal-meta">
				<span>{(createMode && draftTask ? draftTask : task).type}</span>
				<span>{(createMode && draftTask ? draftTask : task).status ?? 'pending'}</span>
			</p>
		</div>
		<EditTaskComponent
			task={createMode && draftTask ? draftTask : task}
			runId={targetRunId}
			{componentProps}
			mode={createMode ? 'create' : 'edit'}
			onClose={handleModalClose}
		/>
	</div>
</Modal>

<style>
	.task-shell {
		position: relative;
		display: grid;
		width: 100%;
		max-width: 100%;
		box-sizing: border-box;
	}

	.task-info {
		padding: 0 1rem;
		padding-bottom: 3rem;
		border-radius: 5px;
		border-bottom: 1px solid var(--primary-color);
	}

	.pill-container {
		padding-bottom: 2px;
	}

	.task-title-with-status {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.task-content {
		min-width: 0;
		width: 100%;
	}

	.task-toolbar {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 1em;
		padding: 1.5rem 0;
	}

	.data-block-container {
		margin-top: 0.5rem;
	}

	.delete-action {
		display: inline-flex;
		align-items: center;
		margin-left: 1rem;
	}

	.task-action:hover {
		border-color: rgba(255, 255, 255, 0.3);
		background: rgba(255, 255, 255, 0.08);
		transform: translateY(-1px);
	}

	.task-stats {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
		font-size: 0.82rem;
	}

	.result-data {
		margin: 0.5rem 0 0;
		max-height: 20rem;
		overflow: auto;
		font-size: 0.85rem;
		white-space: pre-wrap;
		word-break: break-word;
		font-family: 'CaskaydiaCove NFM Light', monospace;
		line-height: 1.45;
	}

	.error-block {
		display: grid;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		border: 1px solid rgba(255, 143, 143, 0.25);
		border-radius: 10px;
		background: rgba(255, 143, 143, 0.05);
	}

	.error-message {
		margin: 0;
		color: #ff8f8f;
		font-size: 0.9rem;
		line-height: 1.45;
		word-break: break-word;
	}

	.debug-block {
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.03);
		padding: 0.4rem 0.6rem;
	}

	.debug-block summary {
		cursor: pointer;
		font-size: 0.82rem;
		opacity: 0.7;
	}

	.debug-block pre {
		margin: 0.4rem 0 0;
		max-height: 12rem;
		overflow: auto;
		font-size: 0.82rem;
		white-space: pre-wrap;
		word-break: break-word;
		font-family: 'CaskaydiaCove NFM Light', monospace;
		line-height: 1.45;
	}

	.edit-modal {
		display: grid;
		gap: 1rem;
		min-width: min(600px, 80vw);
	}

	.edit-modal-header {
		display: grid;
		gap: 0.25rem;
		padding-bottom: 2rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}

	.eyebrow {
		margin: 0;
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		opacity: 0.6;
	}

	.edit-modal-header h2 {
		margin: 0;
		font-size: 1.1rem;
		word-break: break-word;
	}

	.edit-modal-meta {
		display: flex;
		gap: 0.75rem;
		margin: 0;
		font-size: 0.78rem;
		opacity: 0.7;
		text-transform: capitalize;
	}
</style>
