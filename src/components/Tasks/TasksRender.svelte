<script lang="ts">
  import LoadingTask from '@/components/Tasks/LoadingTask.svelte'
  import { taskRenderRegistry } from '@/components/Tasks/taskRenderRegistry'
  import { taskRunner } from '@/stores/taskRunner.svelte'
  import type { Task } from '@/types/taskRunner.types'

  function resolveRenderer(task: Task): any {
    const componentKey = task.component?.trim()
    if (!componentKey) return undefined
    return taskRenderRegistry[componentKey]
  }

  function shouldRenderFallback(task: Task): boolean {
    return task.status !== 'pending'
  }
</script>

{#each taskRunner.tasks as task (task.id)}
  {@const Renderer = resolveRenderer(task)}
  {#if Renderer}
    <Renderer {task} />
  {:else if shouldRenderFallback(task)}
    <LoadingTask {task} />
  {/if}
{/each}
