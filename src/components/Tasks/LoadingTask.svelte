<script lang="ts">
import { show } from "@tauri-apps/api/app"
import { fade } from "svelte/transition"
import { viewState } from "@/stores/viewStore.svelte"
import type { Task, TaskStatus } from "@/types/taskRunner.types"

type Props = {
	task: Task
}

let { task }: Props = $props()
</script>

{#if task.status !== 'done' || viewState.showAllTasks}
  <div class="pill" transition:fade={{ duration: 300 }}>
    <strong>{task.name}</strong>
    {#if task.error}
      <p>{task.error}</p>
    {/if}
  </div>
{/if}

<style>
  .pill {
    border: 1px solid #555;
    border-radius: 999px;
    background-color: rgb(154, 154, 154, 0.1);
    padding: 0.1rem 0.4rem;
    font-size: 0.75rem;
    line-height: 1.2;
    width: max-content;
    padding: 5px 8px;
  }

  .pill::before {
    display: inline-block;
    margin-right: 0.3rem;
    border-radius: 50%;
    background-color: var(--pill-indicator, #6b7280);
    width: 0.5rem;
    height: 0.5rem;
    content: '';
  }

  .pill.done::before {
    background-color: var(--pill-indicator-done, #57f234);
  }

  .pill.done {
    opacity: 0.5;
  }
</style>
