# Shared Browser Tab for All Scraping Functions

## Problem

When `get_page_elements` (or any scraping function) is called, it opens a new browser tab via `with_ready_page`. Each call creates a new page, uses it, and closes it (or leaves it open if `close_page=false`). This causes:

1. **Resource waste** from repeated tab creation/destruction
2. **State contamination** when `close_page=false` is used (zombie pages, shared CDP events)
3. **Race conditions** in concurrent workflows

## Solution

Introduce a **shared persistent tab** that all scraping commands reuse, with mutual exclusion to ensure sequential access.

---

## Architecture

### New: `with_shared_page`

```rust
pub async fn with_shared_page<F, Fut>(work: F) -> Result<T, String>
where
    F: FnOnce(chromiumoxide::Page) -> Fut,
    Fut: Future<Output = Result<T, String>>;
```

- Holds one persistent `Page` behind a `Mutex<Option<Page>>` in `BrowserState`
- First call creates the page; subsequent calls reuse it
- A `Mutex` ensures only one caller runs at a time (serializes all scrap operations)
- If a navigation or page operation errors, the page is considered broken and replaced on next call
- `close_page` parameter is removed from all commands — the page is always kept open

### Existing: `with_ready_page`

Stays unchanged for potential future parallel use cases.

### Existing: `get_document`

Stays unchanged. Currently unused by any migrated caller after the rewrite.

---

## Changes by File

### 1. `browser.rs`

**Add to `BrowserState`:**

```rust
shared_page: Arc<Mutex<Option<Page>>>
```

**Add to `BrowserContext`:**

```rust
shared_page: Arc<Mutex<Option<Page>>>
```

**Add function:**

```rust
pub async fn with_shared_page<F, Fut>(work: F) -> Result<T, String>
where
    F: FnOnce(chromiumoxide::Page) -> Fut,
    Fut: Future<Output = Result<T, String>>;
```

**Update `shutdown_browser`:** close shared page if exists.

**Update `launch_browser_state`:** initialize `shared_page: Arc::new(Mutex::new(None))`.

---

### 2. `youtube.rs`

- `get_page_elements`: replace `with_ready_page(..., close_page.unwrap_or(true))` → `with_shared_page(...)`. Remove `close_page` parameter from signature.
- `search_youtube`: same replacement. Remove `close_page` parameter.

---

### 3. `youtube_info.rs`

- `extract_chapters`: replace `with_ready_page(..., close_page.unwrap_or(true))` → `with_shared_page(...)`. Remove `close_page` parameter.

---

### 4. `page_content_extraction.rs`

- `get_youtube_info`: replace `with_ready_page(..., close_page.unwrap_or(true))` → `with_shared_page(...)`. Remove `close_page` parameter.

---

### 5. `markdown.rs`

- `extract_metadata`: rewrite to use `with_shared_page` directly instead of `get_document`. Remove `close_page` parameter.
- `extract_markdown`: rewrite to use `with_shared_page` directly instead of `get_document`. Remove `close_page` parameter.
- `extract_blog`: replace `with_ready_page(..., close_page)` → `with_shared_page(...)`. Remove `close_page` parameter.

---

### 6. `youTubeProfileTasks.ts`

- `profileTaskRegistry[TaskNames.EXTRACT_PROFILE]` — remove `closePage: false` (line 95)
- `profileTaskRegistry[TaskNames.GET_CHANNEL_VIDEOS]` — remove `closePage: false` (line 134)

---

### 7. `webContextTasks.ts`

- `contextTaskRegistry[WebTaskNames.INIT_YOUTUBE_VIDEO]` — remove `keepPageOpen: false` from `extract_blog` call (line 29)

---

## Key Design Decisions

1. **Mutex serialization**: `with_shared_page` locks the mutex for the entire `work()` duration. All scrap operations run sequentially — this is intentional and ensures no state contamination.

2. **Automatic page recovery**: if `work(page)` returns an error (e.g., navigation failed, page crashed), the shared page is set to `None` so the next call recreates it fresh.

3. **`closePage`/`keepPageOpen` removal**: frontend callers no longer need to manage page lifecycle. The shared page is always reused.

4. **`get_document` stays as-is**: it remains available as a standalone utility. The `extract_metadata` and `extract_markdown` callers are rewritten inline to use `with_shared_page` directly, which is cleaner since they need JS evaluation anyway.

---

## Tauri Commands Affected (signature changes)

| Command             | Parameter Removed |
| ------------------- | ----------------- |
| `get_page_elements` | `close_page`      |
| `search_youtube`    | `close_page`      |
| `extract_chapters`  | `close_page`      |
| `get_youtube_info`  | `close_page`      |
| `extract_metadata`  | `close_page`      |
| `extract_markdown`  | `close_page`      |
| `extract_blog`      | `close_page`      |

---

## Success Criteria

- All scrap operations reuse the same browser tab
- No `closePage: false` / `keepPageOpen: false` needed in frontend callers
- Scrap operations run sequentially (guaranteed by mutex)
- Page crashes on one call don't affect subsequent calls (automatic recovery)
- All existing tests pass
- No regression in `with_ready_page` (remains available for future parallel work)
