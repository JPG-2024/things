<script lang="ts">
import LoadingTask from "@/components/Tasks/LoadingTask.svelte";
import { taskRenderRegistry } from "@/components/Tasks/taskRenderRegistry";
import { workflowManager } from "@/runners/workflowManager.svelte";

const activeTasks = $derived.by(
	() => workflowManager.activeRunner?.tasks ?? []
);

void LoadingTask;
void taskRenderRegistry;
void workflowManager;
void activeTasks;
</script>

{#each activeTasks as task (task.id)}
  {@const componentKey = task.component?.trim()}
  {@const Renderer = componentKey ? taskRenderRegistry[componentKey] : undefined}
  {#if Renderer}
    <Renderer {task} />
  {:else if task.status !== 'pending'}
    <LoadingTask {task} />
  {/if}
{/each}
