# Task Runner Guide

## Overview

The Task Runner is a **DAG-based** (Directed Acyclic Graph) task execution engine. Tasks declare dependencies, and the runner resolves execution order automatically, running independent tasks in parallel when possible.

- **Script tasks** run concurrently if they share no dependencies.
- **IA tasks** run sequentially (one at a time).
- If a task fails, all its descendants are marked `blocked`.
- Tasks can enqueue new tasks mid-run via `taskRunner.enqueueTasks()`.

---

## Core Concepts

### Task Types

| Type     | Purpose                            | Execution      |
|----------|------------------------------------|----------------|
| `script` | Run arbitrary async/sync logic     | Parallel batch  |
| `ia`     | Run LLM chat completion            | Sequential      |

### Task Statuses

`pending` → `running` → `done` | `failed` → descendants become `blocked`

### Global State

Every task receives the full state map (`TaskGlobalState<TMap>`) when it runs. Each key is a task id; the value is whatever that task returned in its `run()` or the LLM response text for `ia` tasks.

---

## Type-Safe State Map

Define an enum for task ids and a state map type to get full type safety across tasks:

```ts
enum TaskNames {
  FETCH_DATA = "fetch-data",
  SUMMARIZE = "summarize",
}

type MyTaskState = {
  [TaskNames.FETCH_DATA]: string;
  [TaskNames.SUMMARIZE]: string;
};
```

---

## Creating a Runner

A runner is a function that:
1. Creates an array of `Task<TStateMap>[]`
2. Passes them to `taskRunner.setTasks()`
3. Calls `taskRunner.run()`

```ts
import { taskRunner } from "@/stores/taskRunner.svelte";
import type { Task } from "@/types/taskRunner.types";

export async function myRunner(input: string): Promise<Task[]> {
  const tasks = createMyTasks(input);
  taskRunner.setTasks(tasks);
  const result = await taskRunner.run();
  return result.tasks;
}
```

---

## Script Task

A script task runs arbitrary code. Its `run()` receives the global state and a `statusUpdater` callback.

```ts
{
  id: TaskNames.FETCH_DATA,
  name: "Fetch Data",
  dependencies: [],           // no dependencies → runs immediately
  type: "script",
  run: async (state) => {
    const response = await fetch("https://api.example.com/data");
    const data = await response.json();
    return data.text;          // returned value becomes state[TaskNames.FETCH_DATA]
  },
}
```

### Key rules for script tasks

- `run()` is **required** and must return `TMap[TId]` (the value stored in state).
- Multiple script tasks with satisfied dependencies run **in parallel** via `Promise.allSettled`.
- Access dependency results through `state[dependencyId]`.
- Use `statusUpdater({ data, debug })` to push intermediate data/debug info to the UI before `run()` completes.

### Script task with dependencies

```ts
{
  id: "process",
  name: "Process Data",
  dependencies: [TaskNames.FETCH_DATA],   // waits for FETCH_DATA to finish
  type: "script",
  run: async (state) => {
    const raw = state[TaskNames.FETCH_DATA];  // typed access to dependency result
    if (!raw) throw new Error("Missing data");
    return raw.toUpperCase();
  },
}
```

---

## IA Task

An IA task sends a chat completion request to an LLM. The runner builds the messages array automatically.

```ts
{
  id: TaskNames.SUMMARIZE,
  name: "Summary",
  dependencies: [TaskNames.FETCH_DATA],
  type: "ia",
  component: "base",                       // optional: UI component hint
  systemMessage: "You are a helpful summarizer.",
  userMessage: "Summarize the context concisely in one paragraph.",
  run: (state) => {
    // optional: return text that gets prepended as context in the user message
    return state[TaskNames.FETCH_DATA] ?? "";
  },
  completionOptions: {
    model: "llama-server",
    temperature: 0.7,
    stream: true,                          // enables token-by-token streaming to UI
  },
}
```

### Key rules for IA tasks

- **Required fields**: `systemMessage`, `userMessage`, `completionOptions` (with `model`).
- `run()` is **optional**. If provided, its return value is injected as context: `"context: {runResult} {userMessage}"`.
- The final LLM response text is stored in state as `string`.
- Set `stream: true` in `completionOptions` to stream tokens to the UI in real time.
- `baseUrl` is optional and overrides the default LLM endpoint.

---

## Dynamic Task Injection

Tasks can add new tasks mid-run using `taskRunner.enqueueTasks()`. New tasks must declare dependencies on existing task ids so the runner knows when to schedule them.

```ts
{
  id: "chapters",
  name: "Process Chapters",
  dependencies: ["content"],
  type: "script",
  run: async (state) => {
    const chapters = parseChapters(state["content"]);

    // dynamically create one IA task per chapter
    const chapterTasks = chapters.map((ch, i) => ({
      id: `chapter-summary-${i}`,
      name: ch.title,
      type: "ia" as const,
      dependencies: i === 0 ? ["chapters"] : [`chapter-summary-${i - 1}`],
      systemMessage: "Summarize this chapter.",
      userMessage: "Summarize in 2-3 lines.",
      run: () => ch.content,
      completionOptions: { model: "llama-server", temperature: 0.5, stream: true },
    }));

    taskRunner.enqueueTasks(chapterTasks);
    return { chapters };
  },
}
```

---

## UI Component Hint

The `component` field is an optional string that tells the frontend which component to render for the task result. Common values:

| Value        | Usage                        |
|--------------|------------------------------|
| `"base"`     | Markdown text output         |
| `"player"`   | Media player                 |
| `"videoInfo"` | Video metadata display      |
| *(omitted)*  | No UI widget rendered        |

Set `widget: false` on dynamically created tasks if you don't want them shown as standalone widgets.

---

## Complete Minimal Example

```ts
import { taskRunner } from "@/stores/taskRunner.svelte";
import type { Task } from "@/types/taskRunner.types";

enum Steps {
  LOAD = "load",
  ANALYZE = "analyze",
  SUMMARIZE = "summarize",
}

type StepState = {
  [Steps.LOAD]: string;
  [Steps.ANALYZE]: { wordCount: number; text: string };
  [Steps.SUMMARIZE]: string;
};

function createTasks(input: string): Task<StepState>[] {
  return [
    {
      id: Steps.LOAD,
      name: "Load Content",
      dependencies: [],
      type: "script",
      run: () => input,
    },
    {
      id: Steps.ANALYZE,
      name: "Analyze",
      dependencies: [Steps.LOAD],
      type: "script",
      run: (state) => {
        const text = state[Steps.LOAD] ?? "";
        return { wordCount: text.split(" ").length, text };
      },
    },
    {
      id: Steps.SUMMARIZE,
      name: "Summarize",
      dependencies: [Steps.ANALYZE],
      type: "ia",
      component: "base",
      systemMessage: "You summarize text concisely.",
      userMessage: "Summarize this in 2 sentences.",
      run: (state) => state[Steps.ANALYZE]?.text ?? "",
      completionOptions: {
        model: "llama-server",
        temperature: 0.7,
        stream: true,
      },
    },
  ];
}

export async function minimalRunner(input: string) {
  taskRunner.setTasks(createTasks(input));
  const result = await taskRunner.run();
  console.log("Done:", result.done, "/", result.total);
  return result.tasks;
}
```

---

## Execution Flow Summary

1. `taskRunner.setTasks(tasks)` — registers tasks and resets state.
2. `taskRunner.run()` — validates the DAG, then loops:
   - Flush any enqueued tasks.
   - Find all `pending` tasks whose dependencies are `done`.
   - If ready tasks are `script` → run **all in parallel**.
   - If ready tasks are `ia` → run **one at a time**.
   - On failure → mark descendants `blocked`, stop.
3. Returns `TaskRunSummary` with counts and snapshot.

## Error Handling

- If a task throws, it gets `status: "failed"` and `error` is set to the message.
- All downstream tasks become `blocked` with an error referencing the failed task.
- The runner stops after the first failure (remaining pending tasks stay `pending`).
- Wrap your runner call in try/catch to handle top-level errors.
