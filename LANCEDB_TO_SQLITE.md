# LanceDB → SQLite Migration Plan

> This document describes the migration of the persistence layer from LanceDB/Arrow to rusqlite (bundled SQLite).

---

## Motivations

- Simplify the Rust codebase by dropping Arrow/LanceDB abstractions
- Reduce dependency footprint (~17 fewer crate deps since several are transitive)
- Use a single `.db` file instead of a directory of Arrow files
- SQLite is more familiar, debuggable, and portable

---

## Dependency Changes

### Cargo.toml

**Remove:**
- `lancedb = "0.27.2"`
- `arrow-array = "57.3.0"`
- `arrow-schema = "57.3.0"`

**Keep:**
- `futures-util = "0.3"` — still used in `browser.rs`

**Add:**
- `rusqlite = { version = "0.33", features = ["bundled"] }`

### Cargo.lock

Auto-regenerated on next `cargo build`.

---

## Database File

| Before | After |
|--------|-------|
| `{app_data_dir}/lancedb/` (directory of Arrow files) | `{app_data_dir}/notian.db` (single SQLite file) |

The file name matches what `cleanup_legacy_sqlite_files` in `lib.rs` used to delete.

---

## Tables

### Before (3 LanceDB tables)

- `articles`
- `article_search` (FTS index was already commented out, unused)
- `article_profiles`

### After (2 SQLite tables)

```sql
CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY,
    url TEXT NOT NULL,
    article_uid TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL DEFAULT 0,
    title TEXT,
    thumbnail TEXT,
    content TEXT,
    media_directory TEXT,
    main_color TEXT,
    profile TEXT,
    tasks_json TEXT NOT NULL DEFAULT '[]',
    embedding_source_text TEXT,
    updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_articles_url ON articles(url);
CREATE INDEX IF NOT EXISTS idx_articles_profile ON articles(profile);

CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    profile_picture TEXT,
    updated_at INTEGER NOT NULL
);
```

`article_search` is dropped entirely — its FTS index was already commented out (`//ensure_search_indices`) and the data was never consumed.

---

## Column Mapping

| Old Arrow field | New SQLite column | Notes |
|-----------------|-------------------|-------|
| `id` | `id` | |
| `url` | `url` | |
| `article_uid` | `article_uid` | UNIQUE |
| `created_at` | `created_at` | |
| `title` | `title` | |
| `thumbnail` | `thumbnail` | |
| `content` | `content` | |
| `directory` | `media_directory` | Renamed; `directory` still populated in Rust struct for API compat |
| `main_color` | `main_color` | |
| `profile` | `profile` | |
| `tasks_json` | `tasks_json` | |
| `embedding_source_text` | `embedding_source_text` | |
| `updated_at` | `updated_at` | |

**Alias fields (unchanged API):**
- `directory` → set to same value as `media_directory`
- `primary_color` → set to same value as `main_color`

These aliases are populated in the Rust `StoredArticleRecord` constructor so the TypeScript layer receives identical data.

---

## Rust: `src-tauri/src/article_store.rs` — Full Rewrite

### Removed code

- All `use lancedb::*` imports
- All `use arrow_array::*` imports (RecordBatch, Int64Array, StringArray, etc.)
- All `use arrow_schema::*` imports (Schema, DataType, Field, etc.)
- `fn articles_schema()`, `fn article_search_schema()`, `fn article_profiles_schema()` — Arrow schema definitions
- `fn open_or_create_table()`, `fn open_articles_table()`, `fn open_article_search_table()`, `fn open_article_profiles_table()` — LanceDB table openers
- `fn ensure_articles_table_schema()`, `fn ensure_article_profiles_schema()`, `fn ensure_search_indices()` — LanceDB migrations
- `fn article_batch()`, `fn article_search_batch()`, `fn article_profiles_batch()` — Arrow RecordBatch builders
- `fn records_from_batches()` — Arrow column extraction
- `fn string_column()`, `fn optional_string_column()`, `fn int64_column()`, `fn optional_int64_column()` — Arrow column helpers
- `fn read_optional_string()`, `fn read_optional_int64()`, `fn read_optional_string_from_column()`, `fn read_optional_int64_from_column()` — Arrow value readers
- `fn sql_string()`, `fn sql_optional_string()` — no longer needed (rusqlite uses `?` bind params)
- `fn connection()` → LanceDB connect → replaced with `fn get_db()` returning `rusqlite::Connection`
- `fn database_path()` → LanceDB directory → replaced with path to `notian.db`

### Kept code

- All `#[tauri::command]` functions with identical signatures
- `StoredArticleRecord`, `StoredArticleProfileRecord`, `UpsertStoredArticleInput` structs (field names unchanged)
- `DeleteStoredArticleProfileResult`, `ProfileWithMostRecentArticle` structs
- `fn normalize_optional_string()`
- `fn article_uid_from_url()` (Sha256)
- `fn article_numeric_id()` (hex prefix → i64)
- `fn chrono_like_now()`
- `fn normalize_profile_bucket()`
- `fn filter_record_to_json()`
- `fn aggregate_profiles()`
- `fn sort_articles_by_created_at_desc()`
- `UNKNOWN_PROFILE_ID`, `UNKNOWN_PROFILE_LABEL` constants

### Design decisions

| Decision | Choice |
|----------|--------|
| Connection management | `get_db()` opens a new `rusqlite::Connection` per call with `PRAGMA` optimizations. SQLite is cheap to open on local disk |
| Async wrapper | Tauri commands are `async fn` by default; they open the connection synchronously inside — no `spawn_blocking` needed since SQLite queries on a local file are sub-millisecond latency |
| Parameter binding | All user data goes through `?` params (rusqlite `params![]`), never string interpolation — SQL injection safe |
| Upsert | `INSERT OR REPLACE INTO` for merge-like behavior |
| Error handling | `.map_err(|e| e.to_string())?` consistently |

---

## Rust: `src-tauri/src/lib.rs` — Minor Changes

- Remove the `cleanup_legacy_sqlite_files()` call (lines 136-138) — `notian.db` is now the active database
- All `pub use crate::article_store::...` imports unchanged
- All `tauri::generate_handler![]` entries unchanged

---

## Frontend: `src/stores/tasksStore.ts` — No Changes

- Same `invoke()` command names (`list_stored_articles`, `upsert_stored_article`, etc.)
- Same TypeScript types and camelCase contract
- All Tauri invoke handlers are unchanged

---

## Files Summary

| File | Action |
|------|--------|
| `src-tauri/Cargo.toml` | Edit: remove lancedb/arrow deps, add rusqlite |
| `src-tauri/src/article_store.rs` | Full rewrite (~1100 → ~400 lines) |
| `src-tauri/src/lib.rs` | Edit: remove `cleanup_legacy_sqlite_files` call |
| All other files | No changes |
