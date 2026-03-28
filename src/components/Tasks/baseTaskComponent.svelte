<script lang="ts">
import type { Snippet } from "svelte";
import Modal from "@/components/Modal.svelte";
import TaskRerunEditor from "@/components/Tasks/TaskRerunEditor.svelte";
import TTSPlayback from "@/components/TTSComponent.svelte";
import type { Task, TaskComponentProps } from "@/types/taskRunner.types";

type Props = {
	runId?: string;
	task: Task;
	children?: Snippet;
	componentProps?: TaskComponentProps;
	autoplayTTS?: boolean;
};

let {
	runId = undefined,
	task,
	children,
	componentProps = {},
	autoplayTTS = false,
}: Props = $props();

let showModal = $state(false);

const playbackId = $derived(runId ? `${runId}:${task.id}` : `task:${task.id}`);
const playbackText = $derived(
	typeof task.data === "string" ? task.data.trim() : ""
);
const resolvedAutoplayTTS = $derived(
	typeof componentProps.autoplayTTS === "boolean"
		? componentProps.autoplayTTS
		: autoplayTTS
);
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
			{#if playbackText}
				<TTSPlayback id={playbackId} text={playbackText} autoplay={resolvedAutoplayTTS} />
			{/if}
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
		border-bottom: 1px solid rgb(255, 255, 255, 0.1);

		.title {
			font-family: "Bitstream Vera Sans";
			font-size: 1.3em;
			margin-right: auto;
			color: var(--primary-color)
		}

	}

	.toolbar {
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
	}

	.wrapped-output {
		text-wrap: auto;
		max-width: 100%;
		overflow-y: auto;
	}


</style>
