<script lang="ts">
  import type { Task } from '@/types/taskRunner.types'
  import Modal from '../Modal.svelte'

  type Props = {
    task: Task
  }

  let { task }: Props = $props()
  let showModal = $state(false)
  console.log('Rendering BaseTaskRender with task:', task)
</script>

{#if typeof task.data === 'string'}
  <div class="base-task-render">
    <div class="task-header">
      <div onclick={() => (showModal = true)} class="task-title">{task.name}</div>
    </div>
    {task.data}
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
    flex-direction: column;
    font-family: 'Noto Sans Mono Thin', monospace;
    white-space: pre-wrap;
    word-break: break-word;

    .task-header {
      font-weight: bold;
      margin-bottom: 0.5em;
    }
  }

  .wrapped-output {
    text-wrap: auto;
    max-width: 100%;
  }
</style>
