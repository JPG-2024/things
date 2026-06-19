# Plan: Add `onComplete` callback to IA tasks

## Goal

Add an optional `onComplete` callback to IA tasks that fires when AI generation ends, receiving the parsed inference result, the run function result, and the current state.

## Files to modify (3)

### 1. `src/types/taskRunner.types.ts`

**Change A** — Add `onComplete` to `IaTask` interface (after `resultParser`, line ~106):

```ts
onComplete?: (params: {
  result: TParsed;
  runResult: string;
  state: Readonly<TaskGlobalState<TMap>>;
}) => void | Promise<void>;
```

**Change B** — Add `'onComplete'` to the `Omit` union in `TaskRerunPatch` (line ~58, after `'endedAt'`):

```ts
| 'endedAt'
| 'onComplete'
```

---

### 2. `src/runners/taskRunner.svelte.ts`

**Change** — In `runIaTask` (line ~487), after `setTaskFields` sets `finalData`, call `onComplete`:

```ts
const finalData = task.resultParser ? await task.resultParser(text) : text;
this.setTaskFields(task.id, { data: finalData as TMap[keyof TMap & string] });
if (task.onComplete) {
	await (task as IaTask<TMap, keyof TMap & string, unknown>).onComplete?.({
		result: finalData,
		runResult,
		state: runtime.state
	});
}
```

Note: `runResult` is already a local variable (line 452) — the string returned by `task.run()`. `runtime.state` is the global state snapshot from `runtimeFor`.

---

### 3. `src/runners/taskSchema.ts`

**Change A** — Add `onComplete` to `IaTaskDefBase` type (after `resultParser`, line ~52):

```ts
onComplete?: (params: {
  result: unknown;
  runResult: string;
  state: Readonly<Record<string, unknown>>;
}) => void | Promise<void>;
```

Note: Using `unknown` for `result` and `Record<string, unknown>` for `state` to match variance requirements (same pattern as other callbacks in the schema).

**Change B** — Pass `onComplete` through in `buildIaTask` return object (line ~207, after `resultParser`):

```ts
onComplete: def.onComplete as IaTask<TMap, TId, TParsed>['onComplete'] as
	| ((params: {
			result: TParsed;
			runResult: string;
			state: Readonly<TaskGlobalState<TMap>>;
	  }) => void | Promise<void>)
	| undefined;
```

---

## Verification

Run `bunx svelte-check --tsconfig ./tsconfig.json` on the 3 modified files to confirm no type errors.
