# Task Runner Implementation Examples

This document shows practical examples for the DAG runner in:

- `src/types/taskRunner.types.ts`
- `src/stores/taskRunner.svelte.ts`

## 1) Minimal linear pipeline

```ts
import type { Task } from '@/types/taskRunner.types';
import { taskRunner } from '@/stores/taskRunner.svelte';

const tasks: Task[] = [
	{
		id: 'extract-title',
		widget: true,
		dependencies: [],
		type: 'script',
		run: async () => 'My article title',
	},
	{
		id: 'normalize-title',
		widget: true,
		dependencies: ['extract-title'],
		type: 'script',
		run: async (state) => String(state['extract-title']).toLowerCase(),
	},
];

taskRunner.setTasks(tasks);
await taskRunner.run();

console.log(taskRunner.tasks.find((t) => t.id === 'normalize-title')?.data);
```

## 2) Parallel script branches

Both tasks can run in parallel because:

- both are `script`
- both dependencies are already satisfied

```ts
const tasks: Task[] = [
	{
		id: 'source',
		widget: true,
		dependencies: [],
		type: 'script',
		run: () => 'raw content',
	},
	{
		id: 'keywords',
		widget: true,
		dependencies: ['source'],
		type: 'script',
		run: async (state) => ({ from: state['source'], items: ['dag', 'runner'] }),
	},
	{
		id: 'summary',
		widget: true,
		dependencies: ['source'],
		type: 'script',
		run: async (state) => ({ from: state['source'], text: 'small summary' }),
	},
];
```

## 3) Script -> IA task

`ia` tasks run one-by-one.

```ts
const tasks: Task[] = [
	{
		id: 'prepare-input',
		widget: true,
		dependencies: [],
		type: 'script',
		run: () => 'Long article text...',
	},
	{
		id: 'ask-llama',
		widget: true,
		dependencies: ['prepare-input'],
		type: 'ia',
		systemMessage: 'You are a concise assistant.',
		userMessage: (state) => `Summarize this: ${state['prepare-input']}`,
		completionOptions: {
			model: 'gpt-4o-mini',
			temperature: 0.2,
			max_tokens: 300,
		},
		baseUrl: 'http://localhost:8080',
	},
];

taskRunner.setTasks(tasks);
await taskRunner.run();

const iaText = taskRunner.tasks.find((t) => t.id === 'ask-llama')?.data;
console.log(iaText); // assistant text
```

## 4) Access direct dependency outputs

Only direct dependencies are passed to each task.

```ts
{
	id: 'final',
	widget: true,
	dependencies: ['keywords', 'summary'],
	type: 'script',
	run: (state) => {
		const keywords = state['keywords'];
		const summary = state['summary'];
		return { keywords, summary };
	},
}
```

## 5) Status updates from script tasks

Use `statusUpdater` to publish interim debug/data while task is running.

```ts
{
	id: 'long-script',
	widget: true,
	dependencies: [],
	type: 'script',
	run: async (_state, update) => {
		update({ debug: 'step 1/3' });
		await new Promise((r) => setTimeout(r, 250));

		update({ debug: 'step 2/3' });
		await new Promise((r) => setTimeout(r, 250));

		update({ data: { partial: true }, debug: 'step 3/3' });
		return { done: true };
	},
}
```

## 6) Fail-fast behavior

When one task fails:

- runner stops scheduling new tasks
- failed task is marked `failed`
- unresolved descendants are marked `blocked`

```ts
const tasks: Task[] = [
	{ id: 'a', widget: true, dependencies: [], type: 'script', run: () => 'ok' },
	{ id: 'b', widget: true, dependencies: ['a'], type: 'script', run: () => { throw new Error('boom'); } },
	{ id: 'c', widget: true, dependencies: ['b'], type: 'script', run: () => 'never' },
];

taskRunner.setTasks(tasks);
const summary = await taskRunner.run();

console.log(summary.failedTaskId); // b
console.log(taskRunner.tasks.find((t) => t.id === 'c')?.status); // blocked
```

## 7) Minimal UI binding sketch (Svelte)

```svelte
<script lang="ts">
	import { taskRunner } from '@/stores/taskRunner.svelte';

	async function runPipeline() {
		await taskRunner.run();
	}
</script>

<button on:click={runPipeline} disabled={taskRunner.running}>
	{taskRunner.running ? 'Running...' : 'Run'}
</button>

{#each taskRunner.tasks as task (task.id)}
	<div>
		<strong>{task.id}</strong> - {task.status}
		{#if task.error}<p>{task.error}</p>{/if}
	</div>
{/each}
```

## 8) Simple Svelte view: one `script` node + one `ia` node with `TextNode`

```svelte
<script lang="ts">
	import TextNode from '@/components/TextNode.svelte';
	import { taskRunner } from '@/stores/taskRunner.svelte';
	import type { Task } from '@/types/taskRunner.types';

	const tasks: Task[] = [
		{
			id: 'base-text',
			widget: true,
			dependencies: [],
			type: 'script',
			run: async () => 'A lonely lighthouse near a silent sea.',
		},
		{
			id: 'story-node',
			widget: true,
			dependencies: ['base-text'],
			type: 'ia',
			systemMessage: 'You are a creative assistant.',
			userMessage: (state) =>
				`Create a very short story (4-6 lines) inspired by this text: "${state['base-text']}"`,
			completionOptions: {
				model: 'gpt-4o-mini',
				temperature: 0.7,
				max_tokens: 180,
			},
			baseUrl: 'http://localhost:8080',
		},
	];

	taskRunner.setTasks(tasks);

	async function runPipeline() {
		await taskRunner.run();
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
