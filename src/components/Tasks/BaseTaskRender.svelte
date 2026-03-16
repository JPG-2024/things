<script lang="ts">
import type { Task } from "@/types/taskRunner.types";
import Modal from "@/components/Modal.svelte";
import MarkdownRenderer from "../MarkdownRenderer.svelte";
import TTSPlayback from "../TTSComponent.svelte";

type Props = {
	runId?: string;
	task: Task;
};

let { runId = undefined, task }: Props = $props();

let showModal = $state(false);
const playbackId = $derived(runId ? `${runId}:${task.id}` : `task:${task.id}`);

void runId;
</script>

{#if typeof task.data === 'string'}
  <div class="base-task-render">
    <div class="task-header">
      <div onclick={() => (showModal = true)} class="task-title">{task.name}</div>
      <TTSPlayback id={playbackId} text={task.data}/>
    </div>
    <MarkdownRenderer content={task.data} />
  </div>
{:else if typeof task.data === 'object' && task.data !== null}
  <pre class="wrapped-output">{JSON.stringify(task.data, null, 2)}</pre>
{:else if task.data != null}
  <div>{task.data}</div>
{/if}
<Modal show={showModal} onClose={() => (showModal = false)}>
  <h2>Task Details</h2>
  <pre class="wrapped-output">{JSON.stringify(task, null, 2)}</pre>
</Modal>

<style>
  .base-task-render {
    display: flex;
    line-height: 1.8rem;
    flex-direction: column;
    font-family: 'CaskaydiaCove NFM Light', monospace;
    white-space: pre-wrap;
    word-break: break-word;

    .task-header {
      display: flex;
      align-items: center;
      gap: 1rem;
      font-weight: bold;
      font-size: 1.2em;
    }
  }

  .task-title {
    font-family: Fira Sans Two;
    cursor: pointer;
    color: var(--primary-color);
    user-select: none;
  }

  .wrapped-output {
    text-wrap: auto;
    max-width: 100%;
  }
</style>
