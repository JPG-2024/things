<script lang="ts">
  import TextNode from '@/components/TextNode.svelte'
  import { taskRunner } from '@/stores/taskRunner.svelte'
  import type { Task } from '@/types/taskRunner.types'

  // async function that returns a string after 2 seconds
  async function delayedString(): Promise<string> {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve('A lonely lighthouse near a silent sea.')
      }, 2000)
    })
  }

  const tasks: Task[] = [
    {
      id: 'base-text',
      widget: true,
      dependencies: [],
      type: 'script',
      run: delayedString,
    },
    {
      id: 'story-node',
      widget: true,
      dependencies: ['base-text'],
      type: 'ia',
      systemMessage: 'You are a creative assistant. Answer In Spanish.',
      userMessage: (state) =>
        `Create a very short story (4-6 lines) inspired by this text: "${state['base-text']}"`,
      completionOptions: {
        model: 'gpt-4o-mini',
        temperature: 0.7,
        max_tokens: 180,
      },
      baseUrl: 'http://localhost:8080',
    },
  ]

  taskRunner.setTasks(tasks)

  async function runPipeline() {
    await taskRunner.run()
  }
</script>

<button onclick={runPipeline} disabled={taskRunner.running}>
  {taskRunner.running ? 'Running...' : 'Run'}
</button>

<ul>
  {#each taskRunner.tasks as task (task.id)}
    <li>
      <strong>{task.id}</strong> — {task.status}
      {#if task.id === 'story-node'}
        <div>
          <TextNode taskId={task.id} />
        </div>
      {/if}
      {#if task.error}
        <p>{task.error}</p>
      {/if}
    </li>
  {/each}
</ul>
