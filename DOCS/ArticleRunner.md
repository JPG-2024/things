# Article Runner Guide

## Overview

The Article Runner is the **only** orchestrator of the app. It runs one
linear pipeline per article:

```
source → raw → article → analysis → title → category → embeddings
```

There is no task graph, no workflow stack and no template system: an article
is either analysed or it is not, and the analysis is persisted in two places
(`web_articles.summary` + `web_articles.analysis_divisor`, and one
`article_windows` row per window).

---

## The pieces

| Module                                 | Responsibility                                                  |
| -------------------------------------- | --------------------------------------------------------------- |
| `src/runners/articleSources.ts`        | The three extractors (`web`, `youtube`, `raw`)                  |
| `src/runners/articleRunner.ts`         | The pipeline itself                                             |
| `src/runners/articleManager.svelte.ts` | The sequential queue (one article at a time)                    |
| `src/stores/articleStore.svelte.ts`    | The state of the article that is open                           |
| `src/lib/utils/windowAnalysis.ts`      | The window split, the LLM calls and the context-overflow ladder |
| `src/lib/utils/rawContent.ts`          | Reading and writing the raw body                                |

### Split of responsibilities

- **`viewState`** holds preferences and flags (window level, embedding
  fields, toggles).
- **`articleStore`** holds the data and the progress of the open article.
- The body of an article is **never** in a store: it lives in
  `raw_content/<sha256(url)>.txt` and is read on demand.

---

## The pipeline

### 1. SOURCE

Fetches what the source gives for free. The step returns in two parts:

- **body** — everything the analysis needs, awaited before the step returns:
  - **web**: `extract_blog` → markdown → `compactMarkdown`. The body always
    comes with the extraction.
  - **youtube**: in `full` mode, the transcript
    (`get_youtube_transcript_timed`). It is a separate and expensive request,
    so `metadata` mode skips it.
  - **raw**: the text is already in memory.
- **card decoration** — thumbnail, favicon and channel: started together with
  the body but **not** awaited, so a slow thumbnail, favicon or channel scrape
  never delays the analysis. It is painted as soon as it lands and written to
  the row by a second upsert at the end of the run (see step 3).

The **profile** of a YouTube video is resolved as decoration: the
`web_profiles` row is read first (zero network) and the external scraper is
only asked when the row is missing.

Every step asks _"do I already have this?"_ before spending it:

| Asset     | Already there?             | Action                   |
| --------- | -------------------------- | ------------------------ |
| Raw body  | `raw_content/<sha256>.txt` | Reuse it, no re-fetch    |
| Thumbnail | `web_articles.thumbnail`   | Reuse it, no re-download |
| Analysis  | `article_windows` has rows | Reuse it, no re-analysis |

### 2. RAW

`write_raw_content(url, text)` stores the body. Only sources that gave it
for free write it.

### 3. ARTICLE

`upsert_web_store_article` stores the metadata: title, thumbnail, domain,
profile, date and the `mode`.

The thumbnail and the channel are not there yet (they are decoration), so the
run upserts the row a second time in its `finally` — with whatever the
decoration produced — whether the run succeeded or failed. One writer, in
order: the analysis is never waiting on this.

`mode` is explicit:

| Mode       | Meaning                                            |
| ---------- | -------------------------------------------------- |
| `full`     | Captured **and** analysed                          |
| `metadata` | Captured, pending analysis (completed when opened) |

It replaces the old `template_id` column: the "imported articles" filter is
`mode = 'metadata'`, which is an explicit column instead of a deduction
("no windows yet" would conflate "not analysed" with "the analysis failed").

### 4. ANALYSIS

The only analytic of the app.

- The body is split into windows.
- One LLM call per window, plus one short call that labels its summary
  (best-effort: a failed label only loses the title shown on the card).
- One LLM call merges the window summaries.

The split depends on the source:

- **web**: by markdown headings, one window per section. No knob, no clamp.
- **raw / youtube**: by level. `viewState.windowLevel` is the index into
  `WINDOW_DIVISOR_LADDER = [1, 2, 4, 8, 16]`.

When the context of the model overflows, the run climbs the ladder
(`1 → 2 → 4 → 8 → 16`) and the level it **actually** executed is stored in
`web_articles.analysis_divisor`. The level is never deduced from
`windows.length`.

The result is persisted with `save_article_analysis`, which replaces the
windows of the article in one transaction.

### 5. TITLE

One LLM call seeded with the summary. The result is stored in
`web_articles.title`.

### 6. CATEGORY

The article is embedded (`title + summary`) and compared with the category
exemplars through nearest-neighbour search.

The category is only auto-classified when the article **has no** categories.
The refresh icon in the `CategoryEditor` forces a recalculation.

### 7. EMBEDDINGS

Only when `viewState.embeddingsEnabled`. Every field of the analysis payload
is embedded in **one call** and indexed into the LanceDB table that carries
the same name (`summary` by default), so the vectors that already exist stay
addressable.

---

## The manager (the queue)

```ts
class ArticleManager {
	queue = $state<string[]>([]);
	active = $state<{ url: string; step: string; done: number; total: number } | null>(null);

	open(url: string, options?: { mode?: 'full' | 'metadata' }): Promise<void>;
	refresh(url: string): void;
	enqueue(url: string, options?: { mode?: 'full' | 'metadata' }): void;
	rerunAnalysis(url: string, options?: { windowLevel?: number }): Promise<void>;
}
```

- **Concurrency 1**: the `llama-server` is local and single threaded, so
  running two analyses in parallel would only destroy its context cache.
- `processing` (getter): true while anything is queued or running. This is
  the single start → end signal consumed by the topbar status line.
- `open()` paints the cached data immediately and only enqueues the missing
  analysis.
- `refresh()` jumps the queue and redoes everything (body, thumbnail,
  analysis).
- `rerunAnalysis()` redoes only the windows and the title: the category is
  never overwritten by a rerun.

A run that finishes after the user navigated away **persists** in the
database, but it only writes to the store while its url is still the one on
screen.

### The view lifecycle around a run

The manager owns the `viewState.loaded` / `viewState.loading` signals:

- When a queued run **starts** for the article on screen: `loading = true`,
  `loaded = false` (the topbar sweep re-arms).
- When a run **ends**: `loading = false` always (a finished queue must never
  leave the view stuck behind the paste guard in `clipboard.ts`), and
  `loaded = true` only when a `full`-mode run belongs to the article on
  screen (the sweep fires once per completed process; metadata captures and
  plain opens never sweep).
- `open()` on an already-analysed article clears `loading` right away and
  does **not** raise `loaded`: the sweep is reserved for process ends.

Pipeline step/status writes (`setStep`, `setStatus`) in the runner and the
manager are guarded by `isCurrent(url)`: a background run never mutates the
state of a different open article.

---

## Opening an article

```ts
await articleManager.open(url);
```

- The cached article and its analysis are read with **two local DB reads**,
  **zero network** and **zero LLM**.
- An article without an analysis is enqueued and completed on the spot.

---

## Capturing without analysing

`viewState.captureOnlyOnPaste` (dashboard toolbar) turns a paste into a
background capture: the url is enqueued with `mode: 'metadata'` and the user
stays on the dashboard. The article appears in the list when the capture
finishes, and it is analysed when it is opened.
