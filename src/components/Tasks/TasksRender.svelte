<script lang="ts">
import LoadingTask from "@/components/Tasks/LoadingTask.svelte";
import { taskRenderRegistry } from "@/components/Tasks/taskRenderRegistry";
import { workflowManager } from "@/runners/workflowManager.svelte";

const stackedTasks = $derived.by(() => workflowManager.stackedTasks);

void LoadingTask;
void taskRenderRegistry;
void workflowManager;
void stackedTasks;
</script>

{#each stackedTasks as entry (`${entry.runId}:${entry.task.id}`)}
  {@const task = entry.task}
  {@const componentKey = task.component?.trim()}
  {@const Renderer = componentKey ? taskRenderRegistry[componentKey] : undefined}
  {#if Renderer}
    <Renderer {task} runId={entry.runId} />
  {:else if task.status !== 'pending'}
    <LoadingTask {task} runId={entry.runId} />
  {/if}
{/each}
