<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from '@/components/Icon.svelte';
	import Modal from '@/components/Modal.svelte';
	import Spacer from '@/components/Spacer.component.svelte';
	import TaskRerunEditor from '@/components/Tasks/TaskRerunEditor.svelte';
	import { workflowManager } from '@/runners/workflowManager.svelte';
	import { workflowStore } from '@/stores/workflowStore.svelte';
	import PopupMenu from '@/components/PopupMenu.svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import LuminousText from '@/components/LuminousText.svelte';
	import { defineTask, buildTask } from '@/runners/shared/dynamicTasks';
	import CreateTaskForm from '@/components/Tasks/CreateTaskForm.svelte';

	const TOOLBAR_ICON_SIZE = 16;

	type Props = {
		runId?: string;
		task: Task;
		children?: Snippet;
		componentProps?: TaskComponentProps;
	};

	let { runId = undefined, task, children, componentProps = {} }: Props = $props();

	const targetRunId = $derived(runId ?? workflowStore.focusedRunId);

	let showModal = $state(false);
	let menuOpen = $state(false);
	let contentHeight: number | null = $state(null);

	$effect(() => {
		if (task.status === 'done') {
			contentHeight = null;
		}
	});

	function handleRerun() {
		if (!targetRunId) return;
		void workflowManager.rerunTask(targetRunId, task.id).catch((error) => {
			console.error('Task rerun failed', error);
		});
	}

	function toggleTaskEdit() {
		if (!targetRunId) return;
		workflowManager.addTask(targetRunId, { ...task, status: 'editing' });
	}

	function handleBranch() {
		if (!targetRunId) return;
		console.log(task);
		const def = defineTask({
			dependencies: [task.id],
			userMessage: '',
			model: viewState.aiModel,
			renderOrder: task.renderOrder + 0.01,
			persist: true
		});
		const newTask = buildTask(def, `${task.id} > ${Date.now()}`);
		newTask.status = 'editing';
		workflowManager.addTask(targetRunId, newTask);
	}
</script>

<Spacer defaultOpen={true} forcedClosed={viewState.enableTasksCollapse}>
	{#snippet titleSlot()}
		<div class="task-spacer-title">
			<LuminousText size="1.1em" mode={task.status === 'running' ? 'blink' : 'off'}>
				<span class="task-id-title">{task.name ?? task.id}</span>
			</LuminousText>

			<div class="task-toolbar">
				<Icon
					name="GitBranch"
					onClick={handleBranch}
					tooltipProps={{ content: 'New task from' }}
					size={TOOLBAR_ICON_SIZE}
					color="var(--primary-color)"
					class="task-action"
				/>
				<Icon
					name="RefreshCw"
					onClick={handleRerun}
					size={TOOLBAR_ICON_SIZE}
					color="var(--primary-color)"
					title="Rerun task and descendants"
					class="task-action"
				/>
				<Icon
					name="Wrench"
					onClick={toggleTaskEdit}
					size={TOOLBAR_ICON_SIZE}
					color="var(--primary-color)"
					title="Rerun task and descendants"
					class="task-action"
				/>
				<PopupMenu position="bottom" bind:open={menuOpen}>
					{#snippet trigger()}
						<Icon
							name="MessageSquarePlus"
							size={TOOLBAR_ICON_SIZE}
							color="var(--primary-color)"
							tooltipProps={{ content: 'add message' }}
							class="task-action"
						/>
					{/snippet}
					{#snippet content()}
						<CreateTaskForm
							runId={targetRunId}
							parentTaskId={task.id}
							parentRenderOrder={task.renderOrder}
							onClose={() => (menuOpen = false)}
						/>
					{/snippet}
				</PopupMenu>
				<!-- <TaskRerunEditor {task} {runId} /> -->
			</div>
		</div>
	{/snippet}
	<div class="task-shell">
		<div class="task-content">
			{@render children?.()}
		</div>
		<div class="task-footer is">
			<div class="toolbar"></div>
		</div>
	</div>
</Spacer>

<Modal show={showModal} onClose={() => (showModal = false)}>
	<h2>Task Details</h2>
	<pre class="wrapped-output">{JSON.stringify(task, null, 2)}</pre>
</Modal>

<style>
	.task-shell {
		position: relative;
		display: grid;
		width: 100%;
		max-width: 100%;
		box-sizing: border-box;

		&:hover .task-footer .toolbar {
			visibility: visible;
		}
	}

	.task-spacer-title {
		display: flex;
		align-items: center;
		gap: 1rem;
		font-size: 0.9em;
	}

	.task-id-title {
		color: rgb(255, 255, 255, 0.5);
		text-transform: capitalize;
	}

	.toolbar {
		display: flex;
		align-items: center;
		gap: 1rem;
		visibility: hidden;
	}

	.task-footer {
		width: 100%;
		display: flex;
		justify-content: flex-end;
		align-items: center;
	}

	.task-content {
		min-width: 0;
		width: 100%;
		padding: 10px 0;
	}

	.task-toolbar {
		display: flex;
		align-items: center;
		gap: 1em;
		opacity: 0.5;
	}

	.task-placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		color: rgba(255, 255, 255, 0.5);
		font-size: 0.9rem;
		min-height: 80px;
	}

	.task-action {
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.04);
		padding: 0.45rem 0.9rem;
		color: inherit;
		font: inherit;
		font-size: 0.8rem;
		cursor: pointer;
		transition:
			background 0.2s ease,
			border-color 0.2s ease,
			transform 0.2s ease;
	}

	.task-action:hover {
		border-color: rgba(255, 255, 255, 0.3);
		background: rgba(255, 255, 255, 0.08);
		transform: translateY(-1px);
	}

	.wrapped-output {
		text-wrap: auto;
		max-width: 100%;
		overflow-y: auto;
	}
</style>
