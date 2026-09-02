# Schema-Driven Workflows

## Overview

The schema-driven workflow system lets you define an entire task pipeline in a single declarative object. Zod schemas describe each task's output shape, and all types are auto-inferred — no manual type maps required.

**Before** (multiple files, manual types):

```
tasks/
├── webTasks.shared.ts   ← enum, TaskState map, factory types
├── webCrawlTasks.ts     ← crawl task registry
├── webContextTasks.ts   ← context task registry
├── webSummaryTasks.ts   ← summary task registry
└── webTasks.ts          ← merges all registries
```

**After** (single file):

```
tasks/
├── webTasks.shared.ts   ← only helpers + enum
└── webWorkflow.ts       ← single workflow definition
```

---

## API

### `defineWorkflow(config)`

Main entry point. Takes a config object with a `tasks` record and returns a workflow with a ready-to-use `registry`.

```ts
import { defineWorkflow, scriptTask, iaTask } from '@/runners/taskSchema';

export const myWorkflow = defineWorkflow({
	tasks: {
		// task definitions go here
	}
});

export const myTaskRegistry = myWorkflow.registry;
```

### `scriptTask(def)`

Defines a script (code) task. The `output` field is a Zod schema describing the return type.

```ts
scriptTask({
	name: 'Fetch Data',
	dependencies: [],
	persist: true,
	component: 'ask',
	output: z.string(),
	run: ({ state, context }) => 'hello'
});
```

### `iaTask(def)`

Defines an AI/LLM task.

```ts
iaTask({
	dependencies: ['fetch-data'],
	component: 'taskBase',
	output: z.string(),
	systemMessage: 'You are a summarizer.',
	userMessage: 'Summarize the context.',
	run: ({ state }) => state['fetch-data'],
	completionOptions: {
		model: 'llama-server',
		temperature: 0.7,
		stream: true
	}
});
```

---

## Task Definition Fields

| Field            | Type                 | Required                   | Description                                                        |
| ---------------- | -------------------- | -------------------------- | ------------------------------------------------------------------ |
| `name`           | `string`             | No                         | Display name                                                       |
| `dependencies`   | `string[]`           | No                         | Task ids that must complete first                                  |
| `component`      | `string`             | No                         | UI component hint                                                  |
| `componentProps` | `object \| function` | No                         | Props for UI component. Can be `(ctx) => props` for dynamic values |
| `gridSpan`       | `1 \| 2`             | No                         | Grid column span (1 = single, 2 = full width)                      |
| `persist`        | `boolean`            | No                         | Save result to DB                                                  |
| `output`         | `Zod schema`         | **Yes**                    | Schema for return type                                             |
| `run`            | `function`           | **Yes** (script) / No (IA) | Task logic                                                         |

### IA-only fields

| Field               | Type                 | Required | Description           |
| ------------------- | -------------------- | -------- | --------------------- |
| `systemMessage`     | `string \| function` | **Yes**  | System prompt         |
| `userMessage`       | `string \| function` | **Yes**  | User prompt           |
| `completionOptions` | `object`             | **Yes**  | LLM options           |
| `baseUrl`           | `string`             | No       | Override LLM endpoint |

---

## Dynamic Messages & Props

`systemMessage`, `userMessage`, and `componentProps` can be functions:

```ts
iaTask({
	systemMessage: ({ context }) => {
		const ctx = context as MyContext;
		return `Respond in ${ctx.language === 'es' ? 'Spanish' : 'English'}.`;
	},
	userMessage: 'Summarize the article.',
	componentProps: ({ context }) => ({
		autoplayTTS: (context as MyContext).freshRun
	})
	// ...
});
```

---

## Using the Registry

```ts
import { buildTaskSubroutine } from '@/runners/taskBuilder';
import { workflowManager } from '@/runners/workflowManager.svelte';
import { appTaskRegistry, TaskNames } from './tasks/appWorkflow';

const tasks = await buildTaskSubroutine(
	[TaskNames.FETCH, TaskNames.SUMMARY],
	appTaskRegistry,
	{ url: 'https://example.com', language: 'en', freshRun: true },
	{ persistedTasks: cachedTasks, Rebuild: false }
);

const result = await workflowManager.run(runId, tasks, { makeActive: true });
```

---

## Zod Schema Notes

- `z.string()` for text
- `z.object({...})` for structured data
- `z.record(z.string(), z.string())` for key-value maps (Zod 4 syntax)
- `z.array(z.string())` for arrays
- Schema is used for type inference; runtime validation is optional

---

## Migration Checklist

1. Create `tasks/<domain>Workflow.ts` with `defineWorkflow()`
2. Move all task definitions into the single workflow
3. Keep `<domain>Tasks.shared.ts` for helpers only (enum, `getRequiredTaskState`, defaults)
4. Delete old sub-registry files
5. Update runner import to point to `./tasks/<domain>Workflow`
6. Add `export { TaskNames }` re-export from the workflow file
