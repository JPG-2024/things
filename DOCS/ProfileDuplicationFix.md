# Profile / Article Duplication Fix

## Problem

Fresh YouTube video runs produced duplicate rows in the SQLite DB:

- **Duplicate profile articles** in `web_articles` keyed by the channel URL — e.g. `https://www.youtube.com/@lucynow/videos` and `https://www.youtube.com/@LucyNow/videos` both stored as separate rows.
- **Duplicate profile rows** triggered in `web_profiles` because the `getProfile` lookup in `PROFILE_FROM_VIDEO` was case-sensitive and missed the already-saved lowercase id, causing `profileRunner` to re-run.

The dashboard (`+page.svelte`) uses `getProfilesWithArticlesAfter`, which aggregates by the article's `profile` field. The duplicate articles were the visible symptom in the UI.

### Root cause

Three compounding inconsistencies:

1. **Scraping preserved case** — `VIDEO_INFO` and `EXTRACT_PROFILE` extracted `profileId` from YouTube with the original case (`@LucyNow`).
2. **Profile saves were lowercased** — `saveProfile` in `webStore.ts` lowercased the id before writing to `web_profiles`.
3. **The article URL was saved with the case-preserved profile URL** — `profileVideosRunner.onRunResult` called the old combined `saveTasks`, which did both `upsert_web_store_article` (storing the profile URL as the article `url`) and `upsert_web_store_tasks`.

SQLite `WHERE id = ?1` and `WHERE url = ?1` are case-sensitive by default, so neither the profile check nor the article merge found existing rows across different cases.

## Fix

Three coordinated changes:

### 1. Refactor: split `saveTasks` into `saveArticle` + `saveTasks`

`saveTasks` previously did both upserts in a single `Promise.all`. The profile runner was reusing it, so every profile run created an article row keyed by the profile URL. That row is the source of the duplicate URLs the user observed.

`src/stores/webStore.ts`:

- New `saveArticle(url, tasksToSave, valuesToOverride?)` — calls `upsert_web_store_article` only. Self-contained: fetches existing article, builds input via `buildUpsertInput`, invokes the Tauri command.
- Refactored `saveTasks<TMap>(url, tasks)` — calls `upsert_web_store_tasks` only. Fetches existing, merges tasks, invokes. The `valuesToOverride` parameter was removed (it was only consumed by the article input builder).

Caller updates:

- `src/runners/youtube/youTubeRunner.ts` — calls `Promise.all([saveArticle(...), saveTasks(...)])` so the video URL gets both an article row and a tasks row.
- `src/runners/web/webRunner.ts` — same `Promise.all` pattern for web pages.
- `src/runners/youtube/profileVideosRunner.ts` — calls **only** `saveTasks(url, runResult.tasks)`. No article is created for the profile URL anymore. The previously commented-out call was replaced with the active tasks-only call.

### 2. Normalize case at extraction (TS)

`src/runners/youtube/tasks/youtubeWorkflow.ts`:

- L136 (`INIT_YOUTUBE_PROFILE`): `(ctx.profileId || urlObj.pathname.split('/')[1]).toLowerCase()`.
- L205 (`VIDEO_INFO`): `videoInfo.profileId = videoInfo.profileId.slice(1).toLowerCase()`.
- L316 (`EXTRACT_PROFILE`): `((result.profile as string[])[0] ?? '').toLowerCase()`.

This guarantees that any `profileId` flowing into the URL, the profile table, or the article `profile` field is always lowercase.

### 3. Case-insensitive lookups (Rust)

`src-tauri/src/web_store.rs` — added `COLLATE NOCASE` to every `WHERE id = ?1` / `WHERE url = ?1` clause:

- L335 `query_profile_by_id`
- L607 `get_web_store_article_by_url`
- L639 UPDATE in `upsert_web_store_article`
- L692 `delete_web_store_article_by_url`
- L817 `get_web_store_tasks_by_url`
- L859 `delete_web_store_tasks_by_url`

This makes the profile check in `PROFILE_FROM_VIDEO` succeed across cases, makes the article merge in `saveArticle` idempotent, and makes `EXTRACT_CHANNEL_VIDEOS` (which uses `get_web_store_article_by_url` to dedupe video URLs) robust to case-mixed video URLs scraped from the channel page.

## What is NOT included

- **No data migration** — existing duplicate rows in the user's DB are left untouched.
- **No unique index on `LOWER(url)`** — could be added later once legacy duplicates are cleaned up manually; would otherwise fail to create if duplicates exist.

## Validation

- `bunx svelte-check --tsconfig ./tsconfig.json` — 0 errors in modified files (45 pre-existing errors in `youtubeSummaryTasks.ts`, `cacheStore.ts`, etc., unrelated to this change).
- `bunx prettier --check` on all modified files — all match the project style.
- `cargo test --manifest-path src-tauri/Cargo.toml` — compiles cleanly, 0 test failures (only pre-existing unused-code warnings).

## Files changed

| File                                           | Change                                                                                           |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `src/stores/webStore.ts`                       | Split `saveTasks` → `saveArticle` + `saveTasks` (tasks-only)                                     |
| `src/runners/youtube/youTubeRunner.ts`         | Call `saveArticle` + `saveTasks` in `Promise.all`                                                |
| `src/runners/youtube/profileVideosRunner.ts`   | Call only `saveTasks` (uncomment + clean)                                                        |
| `src/runners/web/webRunner.ts`                 | Call `saveArticle` + `saveTasks` in `Promise.all`                                                |
| `src/runners/youtube/tasks/youtubeWorkflow.ts` | `.toLowerCase()` in `INIT_YOUTUBE_PROFILE` (L136), `VIDEO_INFO` (L205), `EXTRACT_PROFILE` (L316) |
| `src-tauri/src/web_store.rs`                   | `COLLATE NOCASE` in 6 SQL lookups (L335, L607, L639, L692, L817, L859)                           |
