<script lang="ts">
import type { Snippet } from "svelte";
import Modal from "@/components/Modal.svelte";
import TaskRerunEditor from "@/components/Tasks/TaskRerunEditor.svelte";
import type { Task, TaskComponentProps } from "@/types/taskRunner.types";

type Props = {
	runId?: string;
	task: Task;
	children?: Snippet;
	componentProps?: TaskComponentProps;
};

let {
	runId = undefined,
	task,
	children,
	componentProps = {},
}: Props = $props();

let showModal = $state(false);
</script>

<div class="task-shell">
		<div class="task-header">
			<span class="title">{task.name}</span>
		</div>

	<div class="task-content">
		{@render children?.()}
	</div>
	<div class="task-footer is">
		<div class="toolbar">		
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
		gap: 0.9rem;
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
			font-family: "Bitstream Vera Sans";
			font-size: 1.1rem;
			margin-right: auto;
			color: var(--primary-color)
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
		padding: 0.6em 0;
	}


	.task-content {
		min-width: 0;
		width: 100%;
		font-size: 1.2rem;
	}

	.wrapped-output {
		text-wrap: auto;
		max-width: 100%;
		overflow-y: auto;
	}


</style>
