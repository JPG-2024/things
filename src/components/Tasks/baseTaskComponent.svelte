<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from '@/components/Icon.svelte';
	import { workflowManager } from '@/runners/workflowManager.svelte';
	import { workflowStore } from '@/stores/workflowStore.svelte';
	import { updateTaskDataById } from '@/stores/webStore';
	import Modal from '@/components/Modal.svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import LuminousText from '@/components/LuminousText.svelte';
	import Pill from '@/components/Pill.svelte';
	import { buildTask, createIaTask } from '@/runners/shared/taskFactories';
	import EditTaskComponent from '@/components/Tasks/EditTaskComponent.svelte';
	import type { Task, TaskComponentProps } from '@/types/taskRunner.types';
	import { statusToPillStatus } from '@/lib/utils/tasks/taskStats';

	const TOOLBAR_ICON_SIZE = 18;

	type Props = {
		runId?: string;
		task: Task;
		children?: Snippet;
		componentProps?: TaskComponentProps;
	};

	let { runId = undefined, task, children, componentProps = {} }: Props = $props();

	const targetRunId = $derived(runId ?? workflowStore.focusedRunId);
	const pillStatus = $derived(statusToPillStatus(task.status));

	let showEditModal = $state(false);
	let draftTask = $state<Task | null>(null);
	let createMode = $state(false);

	async function handleRerun() {
		if (!targetRunId) return;
		try {
			const summary = await workflowManager.rerunTask(targetRunId, task.id);
			const updatedTask = summary.tasks.find((t) => t.id === task.id);
			if (updatedTask?.persist) {
				await updateTaskDataById(targetRunId, task.id, updatedTask.data);
			}
		} catch (error) {
			console.error('Task rerun failed', error);
		}
	}

	function openTaskEdit() {
		createMode = false;
		draftTask = null;
		showEditModal = true;
	}

	function handleBranch() {
		if (!targetRunId) return;
		const def = createIaTask({
			dependencies: [task.id],
			userMessage: '',
			model: viewState.aiModel,
			renderOrder: (task.renderOrder ?? 0) + 0.01,
			persist: true
		});
		const newTask = buildTask(`${task.id} > ${Date.now()}`, def);
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
	<div class="task-title-with-status">
		<LuminousText mode="on" glowOpacity={0.5}>
			<span class="task-title-name">{task.name ?? task.id}</span>
		</LuminousText>
		<div class="pill-container">
			<Pill status={pillStatus} text={task.status ?? 'pending'} showPoint />
		</div>
		<div class="task-toolbar" onclick={(e) => e.stopPropagation()}>
			<Icon
				name="RefreshCw"
				onClick={handleRerun}
				size={TOOLBAR_ICON_SIZE}
				tooltipProps={{ content: 'Rerun task and descendants' }}
				class="task-action"
			/>
			<Icon
				name="SquarePen"
				onClick={openTaskEdit}
				size={TOOLBAR_ICON_SIZE}
				tooltipProps={{ content: 'edit task' }}
				class="task-action"
			/>
			<Icon
				name="GitBranch"
				onClick={handleBranch}
				size={TOOLBAR_ICON_SIZE}
				tooltipProps={{ content: 'New task from' }}
				class="task-action"
			/>
			<div class="delete-action">
				<Icon
					name="Trash"
					onClick={handleDelete}
					size={TOOLBAR_ICON_SIZE}
					tooltipProps={{ content: 'delete task' }}
					class="task-action"
				/>
			</div>
		</div>
	</div>

	<div class="task-content">
		{@render children?.()}
	</div>
</div>

<Modal show={showEditModal} onClose={handleModalClose}>
	<div class="edit-modal">
		<!-- 		<div class="edit-modal-header">
			<p class="eyebrow">{createMode ? 'New task from' : 'Edit task'}</p>
			<h2>
				{(createMode && draftTask ? draftTask : task).name ??
					(createMode && draftTask ? draftTask : task).id}
			</h2>
			<p class="edit-modal-meta">
				<span>{(createMode && draftTask ? draftTask : task).type}</span>
				<span>{(createMode && draftTask ? draftTask : task).status ?? 'pending'}</span>
			</p>
		</div> -->
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

	.pill-container {
		padding-bottom: 2px;
	}

	.task-title-with-status {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.task-title-name {
		text-transform: capitalize;
		font-size: 1.1rem;
	}

	.task-content {
		min-width: 0;
		width: 100%;
	}

	.task-toolbar {
		display: flex;
		align-items: center;
		gap: 1em;
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.15s ease;
	}

	.task-title-with-status:hover .task-toolbar {
		opacity: 1;
		pointer-events: auto;
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
