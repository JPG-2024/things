# Memory Leak Fix Plan

## 1. [HIGH] EventSource leak in TTS Store — `src/stores/ttsStore.svelte.ts:55-99`

**Problem:** `addVoice()` opens an EventSource that is only closed inside `onmessage`/`onerror` handlers. No external abort mechanism. Calling `startAddVoice()` while a previous EventSource is active leaves the old one as a zombie connection.

**Fix steps:**
- [ ] Add a `#activeVoiceSource: EventSource | undefined` field to the class.
- [ ] At the top of `startAddVoice()`, before creating a new EventSource, close any existing `#activeVoiceSource`.
- [ ] In the promise's `onmessage`/`onerror` handlers, set `#activeVoiceSource = undefined` after closing.
- [ ] Wrap the promise logic in a `try/finally` so the EventSource is closed on early exit or error.

**Estimated effort:** Small (1 file, ~15 lines changed)

---

## 2. [HIGH] Unbounded segment Map in cache store — `src/stores/cacheStore.ts:17-97`

**Problem:** The `segments` Map grows forever with no eviction strategy. `invalidate()` sets `data` to `null` but never removes the key.

**Fix steps:**
- [ ] Add a `MAX_CACHED_SEGMENTS` constant (e.g., 100).
- [ ] In the `load()` function, after adding a new entry, check if the number of keys exceeds the limit. If so, use an LRU strategy: track access order and evict the least recently used entry.
- [ ] Alternatively (simpler): track access timestamps and evict entries older than a TTL (e.g., 30 minutes) in `load()`.
- [ ] Change `invalidate()` to actually **delete** the key from the map instead of setting data to null, forcing a refetch next time.
  ```ts
  update((state) => {
      const { [key]: _, ...rest } = state.segments;
      return { ...state, segments: rest };
  });
  ```
- [ ] Optionally add a `prune()` public method that callers can invoke to trim old entries.

**Estimated effort:** Medium (1 file, ~30-40 lines changed)

---

## 3. [MEDIUM] `inProgressRequests` Map can leak — `src/lib/urlRouter/urlRouter.ts:25`

**Problem:** Entries in `inProgressRequests` are only deleted in the promise's `finally` block. If a promise never settles (network hang without timeout), the entry stays forever.

**Fix steps:**
- [ ] Add a timeout wrapper around the routed promise. Wrap the request in `Promise.race` with a configurable timeout (e.g., 30 seconds).
- [ ] If the timeout wins, delete the entry from `inProgressRequests` and the underlying promise will also be caught.
- [ ] Alternatively, add a periodic cleanup: a `setInterval` every 60 seconds that scans `inProgressRequests` and removes any entries where the promise hasn't resolved. Race condition risk requires care.
- [ ] **Preferred approach:** Use `Promise.race` with timeout. When timeout fires, delete the map entry and reject.

**Estimated effort:** Small (1 file, ~10-15 lines changed)

---

## 4. [MEDIUM] `$effect` audio.play() without cleanup — `src/components/TTSComponent.svelte:108-116`

**Problem:** The `$effect` that calls `audioElement.play()` does not return a cleanup function. If the component unmounts during playback, audio resources may persist.

**Fix steps:**
- [ ] Return a cleanup function from the `$effect` that calls `audioElement?.pause()` (and optionally `audioElement?.removeAttribute("src")`).
- [ ] Ensure `audioElement` is retrieved via a `let` binding or `document.getElementById` and is accessible in the cleanup closure.

```svelte
$effect(() => {
    if (ttsState.audioSrc && audioElement && ttsState.activeId === id) {
        audioElement.play().catch((err: unknown) => {
            if (err instanceof Error && err.name !== "AbortError") {
                ttsState.errorMessage = "Playback was blocked by the browser.";
            }
        });
    }

    return () => {
        audioElement?.pause();
    };
});
```

**Estimated effort:** Small (1 file, ~3 lines added)

---

## 5. [MEDIUM] `$effect` autoplay fetch without AbortController — `src/components/TTSComponent.svelte:118-137`

**Problem:** The autoplay `$effect` calls `handlePlay()`, which makes a `fetch()` via `generateSpeech()`. No `AbortController` is passed, so if the component unmounts during the request, the fetch continues consuming bandwidth.

**Fix steps:**
- [ ] In `src/lib/services/ttsService.ts`, add an optional `signal?: AbortSignal` parameter to `generateSpeech()` and pass it to the `fetch()` call.
- [ ] In `TTSComponent.svelte`, create an `AbortController` inside the autoplay `$effect`, pass its signal to `generateSpeech()`, and return a cleanup function that calls `controller.abort()`.
- [ ] Also update the `handlePlay()` function in the component to accept/use an `AbortSignal`.

```ts
$effect(() => {
    const controller = new AbortController();
    
    if (shouldAutoplay) {
        handlePlay(controller.signal);
    }

    return () => controller.abort();
});
```

**Estimated effort:** Medium (2 files, ~15-20 lines changed)

---

## 6. [MEDIUM] `WorkflowManager.runs` Map unbounded growth — `src/runners/workflowManager.svelte.ts:50`

**Problem:** The `runs` Map only removes entries that are in `stackRunIds`. Entries added but not in the stack are never evicted. Each run holds potentially large data (LLM results, transcripts).

**Fix steps:**
- [ ] Add an explicit `removeRun(id: string)` method that deletes the entry from the Map.
- [ ] Add a `pruneRuns(maxEntries: number = 50)` method that removes the oldest non-stack entries when the Map exceeds a threshold. Track insertion order via an array or `Map` iteration order (Map preserves insertion order).
- [ ] In the page component that consumes `WorkflowManager` (likely `+page.svelte`), call `removeRun()` in `onDestroy` or when navigating away.
- [ ] Identify the callers and add cleanup calls. Search for usage of `WorkflowManager` or `workflowManager` instance.

**Estimated effort:** Medium (2-3 files, ~25-35 lines changed)

---

## 7. [LOW] SSE reader without abort signal — `src/lib/utils/inference.ts:106-152`

**Problem:** `callMistralChat()` uses `reader.read()` in a loop without an `AbortSignal` parameter.

**Fix steps:**
- [ ] Add an optional `signal?: AbortSignal` parameter to `callMistralChat()`.
- [ ] Check `signal?.aborted` before each `reader.read()` call in the loop, mirroring the pattern in `llama-completions.ts`.
- [ ] Note: This function is currently unused. The fix is low priority but prevents future misuse.

**Estimated effort:** Small (1 file, ~8 lines changed)

---

## 8. [LOW] Chat page missing AbortSignal — `src/routes/chat/+page.svelte:83-88`

**Problem:** `chatCompletions()` is called without an `AbortSignal`. If the user navigates away while a response is streaming, the connection remains open.

**Fix steps:**
- [ ] Create an `AbortController` before calling `chatCompletions()`.
- [ ] Pass `controller.signal` as `signal` option.
- [ ] Store the controller and abort it when a new message is sent (canceling the previous stream).
- [ ] Abort the controller in an `onDestroy` or `$effect` cleanup.

**Estimated effort:** Small (1 file, ~10 lines changed)

---

## 9. [LOW] `parseSse` hangs without signal — `src/lib/utils/llama-completions.ts:304-351`

**Problem:** The `while(true)` loop in `parseSse()` already checks `signal?.aborted` before reads, but if no signal is provided and the server stalls, the loop blocks forever.

**Fix steps:**
- [ ] No code change needed if issue #8 is fixed (adding an AbortSignal in the chat page). The pattern is already correct in `parseSse`.
- [ ] Optionally add an internal default timeout when no signal is provided (e.g., 120 seconds).

**Estimated effort:** Trivial (verify after fixing #8)

---

## 10. [LOW] Static `BROWSER_STATE` Mutex never dropped — `src-tauri/src/browser.rs:65`

**Problem:** Static `Mutex<Option<BrowserState>>` lives for the process lifetime. The browser and task handle are cleaned on `RunEvent::Exit`, but if hot-reload restarts the backend without the exit handler firing, the browser process could leak.

**Fix steps:**
- [ ] This is mostly a non-issue in production. For development, ensure `shutdown_browser()` is called in a `Drop`-like hook when Tauri reloads. Tauri v2 may have a `reload` event.
- [ ] Low priority. Document in the code as a known limitation.

**Estimated effort:** Minimal (investigation + possibly 5 lines)

---

## 11. [LOW] No pagination on article listing — `src-tauri/src/article_store.rs:798-810`

**Problem:** `list_stored_articles` returns all articles without pagination. `query_articles` uses `.try_collect::<Vec<_>>()` which collects every batch into memory.

**Fix steps:**
- [ ] Add optional `limit: Option<usize>` and `offset: Option<usize>` parameters to the Tauri command.
- [ ] Pass these to `query_articles()` and apply them before collecting (or use `.take(limit).skip(offset)` on the stream).
- [ ] Update the frontend callers to support pagination if needed.

**Estimated effort:** Small (2 files, ~20 lines changed)

---

## Execution Order (Priority)

| Priority | Issue | Dependencies |
|----------|-------|-------------|
| 1 | #1 — EventSource leak in ttsStore | None |
| 2 | #2 — Cache store unbounded growth | None |
| 3 | #4 — audio.play() cleanup | None |
| 4 | #5 — AbortController for TTS fetch | Requires #4 context |
| 5 | #3 — inProgressRequests timeout | None |
| 6 | #6 — WorkflowManager unbounded runs | Requires identifying callers |
| 7 | #8 — Chat AbortSignal | None |
| 8 | #9 — parseSse verify | After #8 |
| 9 | #7 — inference.ts signal | None |
| 10 | #11 — Article pagination | None |
| 11 | #10 — Browser state static | None |
