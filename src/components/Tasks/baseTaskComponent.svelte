<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from '@/components/Icon.svelte';
	import Spacer from '@/components/Spacer.component.svelte';
	import { workflowManager } from '@/runners/workflowManager.svelte';
	import { workflowStore } from '@/stores/workflowStore.svelte';
	import PopupMenu from '@/components/PopupMenu.svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import LuminousText from '@/components/LuminousText.svelte';
	import Pill from '@/components/Pill.svelte';
	import { buildTask, createIaTask } from '@/runners/shared/taskFactories';
	import CreateTaskForm from '@/components/Tasks/CreateTaskForm.svelte';
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
	const isIaTask = $derived(task.type === 'ia');
	const spacerDefaultOpen = $derived(
		task.status === 'editing' || task.status === 'running' || task.status === 'failed'
	);
	const pillStatus = $derived(statusToPillStatus(task.status));

	let menuOpen = $state(false);

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
		const def = createIaTask({
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

	function handleDelete() {
		if (!targetRunId) return;
		workflowManager.removeTask(targetRunId, task.id);
	}

	$inspect(task);
</script>

<div class="task-shell">
	<Spacer title={task.name ?? task.id} defaultOpen={spacerDefaultOpen}>
		<div class="task-info">
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
				<Icon
					name="Trash"
					onClick={handleDelete}
					size={TOOLBAR_ICON_SIZE}
					color="var(--primary-color)"
					tooltipProps={{ content: 'delete task' }}
					class="task-action"
				/>
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
						...(task.component ? [{ key: 'component', value: task.component }] : [])
					]}
				/>

				{#if task.data != null}
					<details class="result-preview">
						<summary>
							data:
							<span class="preview-hint">{dataPreview(task.data)}</span>
						</summary>
						<pre class="result-data">{formatData(task.data)}</pre>
					</details>
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

			{#if isIaTask && task.status !== 'running'}
				<EditTaskComponent {task} runId={targetRunId} {componentProps} />
			{/if}
		</div></Spacer
	>

	<div class="task-content">
		{@render children?.()}
	</div>
</div>

<style>
	.task-shell {
		position: relative;
		display: grid;
		width: 100%;
		max-width: 100%;
		box-sizing: border-box;
	}

	.task-info {
		padding: 1em;
		border-radius: 5px;
		border: 1px solid rgba(255, 255, 255, 0.2);
	}

	.task-spacer-title {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-size: 0.9em;
	}

	.task-id-title {
		color: rgb(255, 255, 255, 0.5);
		text-transform: capitalize;
	}

	.task-content {
		min-width: 0;
		width: 100%;
	}

	.task-toolbar {
		display: flex;
		align-items: center;
		gap: 2em;
		padding: 1rem 0;
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

	.task-stats {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
		padding: 1rem 0;
		font-size: 0.82rem;
	}

	.task-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
	}

	.dependencies-field {
		display: grid;
		gap: 0.35rem;
	}

	.dependencies-field > span {
		opacity: 0.82;
	}

	.dependency-pills {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		align-items: center;
	}

	.result-preview {
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 5px;
		background: rgba(128, 128, 128, 0.13);
		padding: 2px 10px;
	}

	.result-preview summary {
		cursor: pointer;
		font-size: 0.85rem;
		opacity: 0.8;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.preview-hint {
		opacity: 0.5;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 400px;
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
</style>
