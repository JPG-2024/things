# YouTube Video Route Flow

## Overview

Trace of modules and functions touched when `urlRouter()` receives a YouTube video URL (`youtube.com/watch?v=` or `youtu.be/`).

---

## Call Graph

```
urlRouter(url)
 ├─ workflowManager.clearStack()
 ├─ normalizeYouTubeUrl(url)              # helpers.ts — canonicalize URL
 ├─ getTasksByUrl(url)                    # webStore.ts — check cache
 ├─ viewState.url = url                   # viewStore.svelte.ts — set reactive state
 └─ youTubeRunner(url, { cachedTasks })   # youTubeRunner.ts
      ├─ buildYouTubeInitialTasks(url)
      │    ├─ getYouTubeThumbnailUrl()    # youtube.ts — thumbnail URL builder
      │    ├─ downloadImageUrl()          # lib/utils/files.ts — download to disk
      │    ├─ getMediaSrc()               # lib/utils/files.ts — local file src
      │    └─ invoke('get_youtube_transcript_timed')  # Tauri Rust command
      └─ runTemplateWorkflow(url, profileId, tasks, { onRunResult })
           ├─ getProfileTemplateId()      # templateStore.ts
           ├─ getTemplate()               # templateStore.ts
           ├─ buildTasksFromTemplate()    # templateBuilder.ts
           ├─ createDefaultTasks()        # sharedTasks.ts (fallback)
           ├─ applyPersistedTaskState()   # taskBuilder.ts
           ├─ pruneUnneededTasks()        # templateRunner.ts (local fn)
           ├─ workflowManager.run()       # workflowManager.svelte.ts
           │    └─ executeRun() → runner.run()  # taskRunner.svelte.ts
           └─ onRunResult()
                ├─ saveArticle()          # webStore.ts
                ├─ saveTasks()            # webStore.ts
                └─ generateEmbeddingsFromTasks()  # embeddingTasks.ts (if enabled)
```

---

## Module-by-Module Breakdown

### `lib/urlRouter/urlRouter.ts`

**`urlRouter(url, options)`** — Entry point.
1. `workflowManager.clearStack()` — resets stacked workflow runs
2. `normalizeYouTubeUrl(url)` — strips tracking params, canonicalizes to `youtube.com/watch?v=<id>`
3. Deduplicates in-flight requests via `inProgressRequests` map
4. `findRoute(url)` — matches `YOUTUBE_URL_REGEX` → finds `youtubeVideo` route
5. If `forceRunTasks` → `deleteArticleByUrl(url)`; else → `getTasksByUrl(url)` for cache lookup
6. Sets `viewState.url`, `viewState.isCachedArticle`, `viewState.loading`
7. Calls `youTubeRunner(url, { cachedTasks })`

---

### `runners/youtube/youTubeRunner.ts`

**`youTubeRunner(url, config)`** — Orchestrates YouTube processing.
1. `buildYouTubeInitialTasks(cleanUrl)` — creates 4 tasks:
   - **`init-youtube`**: extracts `videoId` + `url` + `language` from `viewState`
   - **`thumbnail`** (depends on init): `getYouTubeThumbnailUrl()` → `downloadImageUrl()` → `getMediaSrc()`, sets `viewState.hoveredPictureSrc`
   - **`timed-captions`** (depends on init): `invoke('get_youtube_transcript_timed', { id, language })` — Tauri Rust command
   - **`content`** (depends on timed-captions): joins captions into single text string
2. `runTemplateWorkflow(cleanUrl, profileId, initialTasks, { ... })` — runs the task pipeline
3. `onRunResult` callback: `saveArticle()` + `saveTasks()`, optionally `generateEmbeddingsFromTasks()`

---

### `runners/templateRunner.ts`

**`runTemplateWorkflow(runId, profileId, initialTasks, options)`** — Generic workflow runner.
1. `getProfileTemplateId(profileId)` + `getTemplate(templateId)` — fetches user template
2. `buildTasksFromTemplate(template.tasks)` — converts template into tasks (or `createDefaultTasks('content')` fallback)
3. Merges initial + template tasks
4. If cached: `createPersistedTaskStateMap()` + `applyPersistedTaskState()` + `pruneUnneededTasks()` — marks done tasks
5. `workflowManager.run(runId, allTasks, { makeActive, Rebuild })` — executes the DAG
6. Calls `options.onRunResult(runResult)` for persistence

---

### `runners/workflowManager.svelte.ts`

**`workflowManager.run(id, tasks, options)`** — Workflow execution engine.
1. `ensureRunRecord(id)` — gets or creates `WorkflowRunState` in `workflowStore`
2. `syncRunStack()` — manages stacked run navigation
3. `executeRun()` — waits for dependencies, then `record.runner.run()` on the `TaskRunner`
4. Updates `workflowStore` status (`pending` → `running` → `done`/`failed`)

---

### `runners/shared/sharedTasks.ts`

**`createDefaultTasks('content')`** — Fallback tasks when no profile template:
- **`summary`**: LLM summarization (depends on `content`)
- **`keywords`**: keyword extraction (depends on `content`)
- **`category`**: AI-generated category
- **`title`**: title generation (depends on `summary`)

---

### `lib/utils/youtube.ts`

**`getYouTubeThumbnailUrl(videoId, quality)`** — Maps quality to YouTube `img.youtube.com` thumbnail URL.

---

### `stores/viewStore.svelte.ts`

**`viewState`** — Reactive state singleton:
- `url` — current article URL
- `isCachedArticle` — loaded from cache flag
- `loading` / `loaded` — UI loading flags
- `hoveredPictureSrc` — set by thumbnail task
- `language` — used by transcript fetch
- `domainUrl` — derived from URL hostname
- `embeddingsEnabled` — gates embedding generation

---

### `stores/webStore.ts`

- **`getTasksByUrl(url)`** — queries persisted tasks for caching
- **`deleteArticleByUrl(url)`** — clears cache on force-refresh
- **`saveArticle(url, tasks)`** / **`saveTasks(url, tasks)`** — persists results

---

### `lib/utils/youtube/helpers.ts`

**`normalizeYouTubeUrl(url)`** — Strips tracking params, returns canonical `https://www.youtube.com/watch?v=<id>`.
