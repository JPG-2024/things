<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from '@/components/Icon.svelte';
	import Modal from '@/components/Modal.svelte';
	import TaskRerunEditor from '@/components/Tasks/TaskRerunEditor.svelte';
	import { workflowManager } from '@/runners/workflowManager.svelte';
	import { workflowStore } from '@/stores/workflowStore.svelte';
	import type { Task, TaskComponentProps } from '@/types/taskRunner.types';

	type Props = {
		runId?: string;
		task: Task;
		children?: Snippet;
		componentProps?: TaskComponentProps;
	};

	let { runId = undefined, task, children, componentProps = {} }: Props = $props();

	const targetRunId = $derived(runId ?? workflowStore.focusedRunId);

	let showModal = $state(false);

	function handleRerun() {
		if (!targetRunId) return;
		void workflowManager.rerunTask(targetRunId, task.id).catch((error) => {
			console.error('Task rerun failed', error);
		});
	}
</script>

<div class="task-shell">
	<div class="task-header"></div>

	<div class="task-content">
		{@render children?.()}
	</div>
	<div class="task-footer is">
		<div class="toolbar">
			<Icon
				name="RefreshCw"
				onClick={handleRerun}
				size={18}
				color="var(--primary-color)"
				title="Rerun task and descendants"
				class="task-action"
			/>
			<TaskRerunEditor {task} {runId} />
		</div>
	</div>
</div>

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

	.task-header {
		width: 100%;
		display: flex;
		justify-content: flex-start;
		align-items: center;
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);

		.title {
			font-family: 'Bitstream Vera Sans';
			font-size: 1.1rem;
			margin-right: auto;
			color: var(--primary-color);
		}
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
		padding-top: 35px;
		min-width: 0;
		width: 100%;
		font-size: 1.2rem;
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
