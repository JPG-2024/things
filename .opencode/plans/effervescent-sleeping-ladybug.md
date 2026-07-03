# Shared Task Repository for KEYWORDS & CATEGORY

## Context

YouTube workflow already has KEYWORDS and CATEGORY tasks. Raw workflow needs them too. To avoid duplicating task definitions across runners, we'll create a shared task repository at `src/runners/shared/` that both runners import from.

Neither KEYWORDS nor CATEGORY uses runner-specific `context` — they only use `state` and `viewState` (global). This makes them ideal candidates for sharing.

## Changes

### 1. Create `src/runners/shared/sharedTasks.ts`

New file defining KEYWORDS and CATEGORY tasks using `iaTask()` with default `TContext = unknown`:

- `SHARED_TASK_IDS` const: `{ KEYWORDS: 'keywords', CATEGORY: 'category' }`
- `sharedOutputSchemas`: zod schemas for both tasks (`z.array(z.string())`)
- `sharedTasks` object: two `iaTask()` definitions matching the current youtube implementations:
  - **KEYWORDS**: depends on `'content'`, uses `stringArrayGbnf(10)`, `parseStructuredArrayResponses`
  - **CATEGORY**: depends on `KEYWORDS`, uses `arrayToGbnf` with `viewState.categories`, `parseStructuredArrayResponses`
- Uses `structuredOutputOptions` (temperature: 0, top_p: 0.9, etc.)

### 2. Update `src/runners/raw/tasks/rawTasks.shared.ts`

Add to `TaskNames` enum:
```
KEYWORDS = 'keywords',
CATEGORY = 'category',
```

### 3. Update `src/runners/raw/tasks/rawWorkflow.ts`

- Import `sharedTasks`, `sharedOutputSchemas`, `SHARED_TASK_IDS` from `@/runners/shared/sharedTasks`
- Add KEYWORDS and CATEGORY to `outputSchemas` using `sharedOutputSchemas`
- Spread `...sharedTasks` into the `defineWorkflow` tasks object

### 4. Update `src/runners/raw/rawRunner.ts`

Add `TaskNames.KEYWORDS` and `TaskNames.CATEGORY` to `defaultRoutine` (between CONTENT and TITLE_SUMMARY, since CATEGORY depends on KEYWORDS which depends on CONTENT):

```ts
const defaultRoutine = [
  TaskNames.TITLE,
  TaskNames.CONTENT,
  TaskNames.KEYWORDS,
  TaskNames.CATEGORY,
  TaskNames.TITLE_SUMMARY
] as const satisfies readonly RawTaskId[];
```

### 5. Update `src/runners/youtube/tasks/youtubeWorkflow.ts`

- Import `sharedTasks` from `@/runners/shared/sharedTasks`
- Remove inline KEYWORDS (lines 243-263) and CATEGORY (lines 264-294) task definitions from `youtubeTasks`
- Spread `...sharedTasks` into the `youtubeTasks` object

## Type Compatibility

Shared tasks use `iaTask()` with default `TContext = unknown`. Since neither task accesses `context`, this is semantically correct. When spread into `defineWorkflow` alongside runner-specific tasks (e.g. `TContext = TaskFactoryContext`), TypeScript's contravariance allows `unknown`-context callbacks to coexist — `TaskFactoryContext` is assignable to `unknown`.

## Verification

1. `bun run lint` — no new errors
2. `bunx svelte-check --tsconfig ./tsconfig.json src/runners/shared/sharedTasks.ts src/runners/raw/tasks/rawWorkflow.ts src/runners/raw/tasks/rawTasks.shared.ts src/runners/raw/rawRunner.ts src/runners/youtube/tasks/youtubeWorkflow.ts` — no new errors
3. `cargo test --manifest-path src-tauri/Cargo.toml` — no regressions (Rust unchanged)
4. Manual: `bun run tauri dev` — raw text runner produces keywords and category results
