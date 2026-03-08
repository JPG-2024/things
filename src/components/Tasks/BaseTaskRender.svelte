<script lang="ts">
import type { Task } from "@/types/taskRunner.types";
import Modal from "@/components/Modal.svelte";
import MarkdownRenderer from "../MarkdownRenderer.svelte";

type Props = {
	task: Task;
};

let { task }: Props = $props();

let showModal = $state(false);
</script>

{#if typeof task.data === 'string'}
  <div class="base-task-render">
    <div class="task-header">
      <div onclick={() => (showModal = true)} class="task-title">{task.name}</div>
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
      font-weight: bold;
      font-size: 1.2em;
    }
  }

  .wrapped-output {
    text-wrap: auto;
    max-width: 100%;
  }
</style>
