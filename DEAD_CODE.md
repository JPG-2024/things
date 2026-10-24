# Dead Code Analysis — `src/`

Generated from a repo-wide audit of `src/` after the **MVP article runner**
refactor (the task/workflow/template model was replaced by a single linear
pipeline per article).

Findings are grouped by removal confidence. All "dead" claims were verified by
grepping the whole `src/` tree for the symbol or the file basename, excluding
its own definition.

> Note: `src/lib/utils/LEGACY/` is excluded from the analysis on purpose: it
> is a graveyard of old services kept out of the build.

---

## Tier 1 — Dead files (never imported anywhere)

These files have zero references outside their own definition. Safe to delete.

### Components (`src/components/`)

| File                               | Notes                                                                                    |
| ---------------------------------- | ---------------------------------------------------------------------------------------- |
| `CategoryWidget.svelte`            | Only match in the repo is the `AGENTS.md` naming-convention example.                     |
| `CompletionOptionsPanel.svelte`    | Duplicated the (now deleted) `inputs/CompletionOptionsEditor.svelte`.                    |
| `InstantResponse.svelte`           | No references.                                                                           |
| `LoadingStack.svelte`              | Wires a `flow-status` Tauri listener, but the module is never imported so it never runs. |
| `PopupMenu.svelte`                 | No references.                                                                           |
| `DetailsPanel.svelte`              | Only reachable from the deleted task editors.                                            |
| `inputs/Textarea.component.svelte` | Only reachable from the deleted task editors.                                            |

### `src/lib/`

| File                                 | Notes                                                  |
| ------------------------------------ | ------------------------------------------------------ |
| `apiListeners.ts`                    | Barrel re-exporting listeners that are never imported. |
| `utils/getImageColor.ts`             | Sole export `getImageColor` unused.                    |
| `utils/media.ts`                     | Sole export `downloadMediaAssets` unused.              |
| `utils/schemas/structuredSchemas.ts` | Sole export `CONTENT_EXTRACTION_SCHEMA` unused.        |

### `src/stores/`, `src/types/`

| File                        | Notes          |
| --------------------------- | -------------- |
| `stores/micStore.svelte.ts` | No references. |
| `types/routeParams.ts`      | No references. |

---

## Tier 2 — Unused exports inside live files

These files are still needed, but contain exports never referenced outside
their own module. They are not broken; they could simply lose the `export`
keyword to tighten the API surface.

### `src/stores/`

- **`webStore.ts`**: `getArticles`, `WEB_STORE_UNKNOWN_PROFILE_ID`,
  `WEB_STORE_UNKNOWN_PROFILE_LABEL`, `normalizeNullableString`.
- **`viewStore.svelte.ts`**: `DEFAULT_PRIMARY_COLOR`, `DEFAULT_BG_COLOR`,
  `rgbToHue` (all internal-only).
- **`scrapStore.svelte.ts`**: `getYoutubeProfile`, `getYoutubeVideoInfo`
  (public but only called internally); exported types
  `FetchMissingProfileVideosResult`, `YoutubeProfile` never imported
  externally.
- **`articleCacheStore.svelte.ts`**: `invalidateCategories`,
  `invalidateCategoryArticles`, `invalidateArticles`,
  `totalArticlesWithoutProfile`.

### `src/lib/`

- **`urlRouter/urlRouter.ts`**: `addUrlRoute` (exported extension hook, never
  called).
- **`utils/tts.ts`**: `isValidLanguage`.
- **`utils/embeddingStore.ts`**: `deleteChunksByArticle`, `deleteChunk`.
- **`utils/url.ts`**: `getRouteForDomain`.
- **`utils/gbnf.ts`**: `objectWithEnumAndStringGbnf`.

---

## Tier 3 — Ambiguous (flag only, do not delete blindly)

- **Internal-only `export`s**: several Tier-2 items are still exported but only
  used inside their own module. They are not dead code; they could simply
  lose the `export` keyword.

---

## What the refactor removed

The task model is gone, so the whole machinery that supported it went with
it. Nothing of it is listed above because it no longer exists:

- **Orchestration**: `taskRunner`, `DependencyGraph`, `workflowManager`,
  `workflowStore`, `templateRunner`, `templateBuilder`, `templateConstants`,
  `taskBuilder`, `taskSchema`, `templateStore`.
- **Per-source runners**: `webRunner`, `youTubeRunner`, `rawRunner`,
  `socialMediaRunner`, `profileVideosRunner`.
- **Processors**: everything but `windowSummary` (`multi`, `analysisTopic`,
  `analysisTopicSplit`, `extraction`, `translate`, `custom`, `summarize`).
- **Task editors**: `EditTaskComponent`, `TaskRerunEditor`,
  `TaskWorkflowEditor`, `CreateTaskForm`, `baseTaskComponent`.
- **Podcast**: the whole `src/features/podcast/` feature.
- **Persistence**: the `web_tasks`, `web_templates` and `web_profile_templates`
  tables, plus the `web_articles.template_id` column.

---

## Methodology / caveats

- There is no `import.meta.glob` in the repo; dynamic component loading only
  happens through static imports.
- The window-analysis processor is imported **dynamically** inside
  `windowAnalysis.ts` so the pure helpers of that module stay unit-testable
  without the inference stack; a grep for the module name alone would call it
  dead.
- There is no JS test runner configured; verifying a deletion means running
  `bun run check` on the modified files and `bun run lint`.
- Substring collisions were re-checked (e.g. `Toggle` vs `ToggleIcon`,
  `Image` vs media vars) so the above lists exclude false positives.
