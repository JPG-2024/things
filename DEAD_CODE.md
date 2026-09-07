# Dead Code Analysis — `src/`

Generated from a repo-wide audit of `src/`. Findings are grouped by removal confidence.
All "dead" claims were verified by grepping the whole `src/` tree (and `src-tauri/` where relevant) for the symbol or file basename, excluding its own definition.

> Note: `src/examples/` and `src/lib/services/` are **empty directories**. `src/db/` (incl. `src/db/migrations/`) contains no files. `src/routes/api/retrieve/` is an empty route directory.

---

## Tier 1 — Dead files (never imported anywhere)

These files have zero references outside their own definition. Safe to delete.

### Components (`src/components/`)

| File                            | Notes                                                                                                            |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `CategoryWidget.svelte`         | Only match in repo is the AGENTS.md naming-convention example (`e.g. CategoryWidget.svelte`).                    |
| `CompletionOptionsPanel.svelte` | Duplicate of live `inputs/CompletionOptionsEditor.svelte`. Imports only a type from `chat-completions-provider`. |
| `InstantResponse.svelte`        | No references.                                                                                                   |
| `LoadingStack.svelte`           | Wires `flow-status` Tauri listener, but the module is never imported so it never runs.                           |
| `PopupMenu.svelte`              | No references.                                                                                                   |
| `TextNode.svelte`               | No references.                                                                                                   |
| `Toggle.svelte` (root)          | All `Toggle` matches are `ToggleIcon`; no `<Toggle>` / `import Toggle` exist.                                    |
| `inputs/Toggle.svelte`          | Same as above; never imported.                                                                                   |
| `Tasks/CreateTaskForm.svelte`   | No references.                                                                                                   |
| `Tasks/TaskRerunEditor.svelte`  | No references.                                                                                                   |

Transitively dead (only imported by the dead `CreateTaskForm`): `inputs/Textarea.component.svelte`.

### `src/lib/`

| File                                      | Notes                                                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `utils/media.ts`                          | Sole export `downloadMediaAssets` unused.                                                                     |
| `utils/getImageColor.ts`                  | Sole export `getImageColor` unused.                                                                           |
| `utils/schemas/structuredSchemas.ts`      | Sole export `CONTENT_EXTRACTION_SCHEMA` unused.                                                               |
| `apiListeners.ts`                         | Barrel re-exporting `markdownListener`/`metadataListener`/`flowStatus`; never imported.                       |
| `listeners/markdownListener.ts`           | Only reachable via dead `apiListeners.ts`; `listenMarkdownFlowStatus` never called.                           |
| `listeners/metadataListener.ts`           | Same as above.                                                                                                |
| `utils/youtube/summarizeChapters.ts`      | `summarizeChapters` never called.                                                                             |
| `utils/youtube/joinCaptionsByChapters.ts` | Only consumed by the dead `summarizeChapters.ts` (for a type).                                                |
| `utils/inference/index.ts`                | Barrel; never imported. Orphans `iaCategorizer`, `inferenceTitle`, `DEFAULT_COMPLETION_OPTIONS` (see Tier 2). |

### Other

| File                                     | Notes                                                                                                            |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `stores/micStore.svelte.ts`              | `micState` never imported. `ConversationMode.svelte` uses `micService` directly, bypassing the store.            |
| `features/podcast/interviewGenerator.ts` | Not imported anywhere.                                                                                           |
| `features/podcast/smalltalkGenerator.ts` | Not imported anywhere.                                                                                           |
| `features/podcast/segmentProvider.ts`    | `resolveSegments` never imported.                                                                                |
| `types/article.types.ts`                 | `Article` interface not exported and never referenced.                                                           |
| `types/routeParams.ts`                   | `ChatRouteParams` never referenced.                                                                              |
| `routes/api/chunk/+server.ts`            | App is SPA-only (`ssr = false`, `adapter-static`); no server serves `/api/chunk`. No client/Tauri references it. |

### Orphaned folder

`src/lib/utils/LEGACY/` — **entire folder is orphaned** (no code imports `LEGACY`). Contains:

- `extractKeywords copy.ts`, `extractKeywords copy 2.ts` (both export `extractKeywords`)
- `llama-inference.ts` (empty, 0 bytes)
- `llama-server-service.ts`, `openai-llama-service.ts`
- `ollama-rs/index.ts`

> ⚠️ AGENTS.md states "Do not edit `LEGACY/` as part of normal work." Although it is dead, deletion should get explicit human approval before removal.

### Empty directories (can be removed)

`src/db/`, `src/examples/`, `src/lib/services/`, `src/routes/api/retrieve/`.

---

## Tier 2 — Unused exports inside live files

These files are still needed, but contain exports never referenced outside their own module.

### `src/constants.ts`

`BLOG_SUMMARY_SYSTEM_PROMPT`, `TECH_SUMMARY_SYSTEM_PROMPT`, `DOCS_SUMMARY_SYSTEM_PROMPT`, `PRESUMMARY`, `YOUTUBE_SUMMARY_PROMPT`, `CHAT_SYSTEM_PROMPT`, `STRUCTURED_RESPONSE_SYSTEM_PROMPT_EN`, `SIMPLE_SUMMARY_SYSTEM_PROMPT_EN2`, `STRUCTURED_SUMMARY_JSON_PROMPT_ES`, plus private `keypoints` (line 62).
_(Used: `RAW_PROCESS_LIMIT`, `SIMPLE_SUMMARY_SYSTEM_PROMPT_EN`/`_ES`, `LANG_NAMES`.)_

### `src/stores/`

- **`webStore.ts`**: `getArticles`, `getPageElementField`, `getFirstStringValue` (only used by the dead `getPageElementField`), `WEB_STORE_UNKNOWN_PROFILE_ID`, `WEB_STORE_UNKNOWN_PROFILE_LABEL`.
- **`templateStore.ts`**: `removeTemplateFromProfile`.
- **`deleteSelectionStore.svelte.ts`**: `isMarked`, `add`, `remove`, `isDeleting`.
- **`articleCacheStore.svelte.ts`**: `invalidateCategories`, `invalidateCategoryArticles`, `invalidateArticles`, `totalArticlesWithoutProfile`.
- **`ttsStore.svelte.ts`**: `addTextContent`, `clearTextContents`, `cleanup`, `chunkEndsParagraph` (getter), `releaseBlobs`, `cancelGeneration`.
- **`scrapStore.svelte.ts`**: `getYoutubeProfile`, `getYoutubeVideoInfo` (public but only called internally); exported types `FetchMissingProfileVideosResult`, `YoutubeProfile` never imported externally.
- **`workflowStore.svelte.ts`**: `getRunTasks`, `getRunStatus`, `allRuns`, `runningRuns`, `isAnyRunning`, `focusedRunStatus`.
- **`viewStore.svelte.ts`**: `DEFAULT_PRIMARY_COLOR`, `DEFAULT_BG_COLOR`, `rgbToHue`, `Message` (all internal-only).
- **`mainVoice.svelte.ts`**: `load`, `profiles`, `chunks`, `loading`, `selectedProfileId` (never read externally).
- **`musicStore.svelte.ts`**: `TrackStatus`, `TrackDownload` (only inferred internally by `DownloadModal`).

### `src/runners/`

- **`taskSchema.ts`**: `getRequiredTaskState`, `createContentGetter`, `InferTaskMap`, `TaskRunContext`, `TaskDefCompleteParams`; and `export type { Resolvable, TaskDefCtx }` (nobody imports these from here).
- **`shared/taskFactories.ts`**: `createSummaryTask` (+ transitively dead `CreateSummaryTaskOptions`).
- **`shared/processors/combineHelpers.ts`**: `parseAndFlattenJsonArrays` (`combineResults` is used).
- **`DependencyGraph.ts`**: `getAllTaskIds`.
- **`taskRunner.svelte.ts`**: `TaskRunnerStore.clear()`, `lastRun` field (internal only).
- **`workflowManager.svelte.ts`**: `addTasks`, `hydrateRun`, `getRunSummary`, `getRunner`, `getTaskData` (callers use `workflowStore.getTaskData`), `activeRunner`, `stackedTasks`, public `setActiveRun`.
- **`youtube/tasks/youtubeTasks.shared.ts`**: `TaskNames` (enum), `InitContext`, `YouTubeTaskFactoryContext`.
- **`youtube/tasks/youtubeTasks.ts`**: barrel module never imported (YouTubePlayer imports `.shared` directly).
- **`src/lib/urlRouter/urlRouter.ts`**: `addUrlRoute` (exported extension hook, never called).

### `src/lib/` (non-barrel)

- **`ttsPlayerConfig.ts`**: `setCurrentStyle`, `getCurrentStyleName`, `DEFAULT_PLAYER_MODE`.
- **`utils/gbnf.ts`**: `objectWithEnumAndStringGbnf`.
- **`utils/url.ts`**: `getRouteForDomain`.
- **`utils/youtube.ts`**: `YoutubeResult` (interface).
- **`utils/youtube/helpers.ts`**: `removeYTPpParam`, `removeYTTimeParam`, `normalizeYouTubeHandle` (`normalizeYouTubeUrl`/`buildYouTubeProfileUrl` are used).
- **`utils/tts.ts`**: `isValidLanguage`.
- **`utils/embeddingStore.ts`**: `deleteChunksByArticle`, `deleteChunk`.
- **`utils/inference/constants.ts`**: `DEFAULT_WEB_COMPLETION_OPTIONS`, `DEFAULT_YOUTUBE_COMPLETION_OPTIONS`, `DEFAULT_RAW_COMPLETION_OPTIONS`, `YOUTUBE_STRUCTURED_OUTPUT_OPTIONS`.
- **`utils/inference/llama-completions.ts`**: `DEFAULT_COMPLETION_OPTIONS` (only via dead barrel).
- **`utils/inference/helpers/categorizer.ts`**: `iaCategorizer` (only via dead barrel).
- **`utils/inference/helpers/inferenceTitle.ts`**: `inferenceTitle` (only via dead barrel).
- **`utils/helpers/tasks.ts`**: `getTaskData` (unrelated to `workflowStore.getTaskData`; never imported).
- **`lib/position.ts`**: `PopupCoords` (interface).

### `src/types/`

- **`taskRunner.types.ts`**: `TaskTypesEnum`, `TaskType` (internal only), `TaskBase` (internal only), `CompletionOptionsValue` (internal only), `TaskRunnerState`, `IaTaskResult`.
- **`template.types.ts`**: `TemplateTaskType` (internal only).
- **`features/podcast/types.ts`**: `PodcastMode`, `SegmentSource` (only used by dead `segmentProvider`), `TurnRole` (internal), `TurnPrompts`, `TurnPromptBuildInput` (only used by dead generators), `PodcastMode` (unused type).

### `features/podcast/prompts.ts`

`interviewHookSystemPrompt`, `interviewQuestionSystemPrompt`, `interviewAnswerSystemPrompt`, `interviewUserPrompt`, `smalltalkHookSystemPrompt`, `smalltalkCasualSystemPrompt`, `smalltalkUserPrompt` — only consumed by the dead `interviewGenerator`/`smalltalkGenerator`.

---

## Tier 3 — Ambiguous (flag only, do not delete blindly)

- **`components/Tasks/taskRenderRegistry.ts`** entries `videoInfo` → `VideoInfo.svelte`, `listItems` → `ListItems.svelte`, `profile` → `ProfileTaskComponent.svelte`, `taskTitle` → `TaskTitleComponent.svelte`. These are reachable only if a user manually types that `component` string in `EditTaskComponent`. Built-in task factories never produce these four keys. Keep unless you confirm no user templates use them. (The other registry entries — `ask`, `taskBase`, `image`, `player`, `keywords`, `recursive` — are produced by built-in tasks and are alive.)
- **Internal-only `export`s**: several Tier-2 items are still exported but only used inside their own module (e.g. many `webStore` internal exports and `musicStore` types). They are not dead code; they could simply lose the `export` keyword to tighten the API surface.

---

## Methodology / caveats

- No `import.meta.glob` exists in the repo; dynamic component loading happens only via the static `taskRenderRegistry.ts` map (imported in `TasksRender.svelte` / `TasksStatusBar.svelte`).
- Processor dispatch (`translate`/`custom`) is string-based via `getProcessor(processorType)` in `recursiveTask.ts` and **is** reachable from the UI dropdown, so those processors are alive.
- There is no JS test runner configured; verifying a deletion means running `bun run check` on the modified files and `bun run lint`.
- Substring collisions were re-checked (e.g. `Toggle` vs `ToggleIcon`, `Image` vs media vars) so the above lists exclude false positives.
