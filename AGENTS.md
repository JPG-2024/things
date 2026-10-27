# AGENTS.md

## svelte-check

Instead of run svelte-check for entire repo run in modified files.
ie: `bunx svelte-check --tsconfig ./tsconfig.json src/routes/+page.svelte 2>&1 | head -100`

## Repo Overview

- Frontend: SvelteKit + Svelte 5 runes.
- Desktop shell/backend: Tauri v2 with Rust in `src-tauri/`.
- Package manager/runtime used in this repo: `bun`.
- TypeScript is strict (`tsconfig.json` has `strict: true`).
- Path alias `@` resolves to `src/`.
- App is configured as a SPA for Tauri via `@sveltejs/adapter-static`.

## Instruction Sources Checked

- Existing root `AGENTS.md`: present and superseded by this file.
- `.cursor/rules/`: not present.
- `.cursorrules`: not present.
- `.github/copilot-instructions.md`: not present.
- If any of the above are added later, treat them as additional repository instructions.

## DEV MODE

- This project runs in DEV MODE: local data (`workspaces/`, `things.db`,
  `raw_content/`, `media/`, `embeddings/`) is throwaway test data. It can be
  wiped or recaptured at any time.
- Never write data migrations or repair code for existing rows. Fix the write
  path instead, so new data is born correct.
- Do not preserve legacy persisted shapes "just in case": if a stored row no
  longer matches what the current code writes, deleting and recapturing is an
  acceptable fix.

## Working Areas

- Frontend routes and UI live in `src/routes/` and `src/components/`.
- Shared TS utilities live under `src/lib/`, `src/stores/`, `src/runners/`, and `src/types/`.
- Tauri Rust code lives under `src-tauri/src/`.
- Database, Tauri capabilities, and app config live in `src-tauri/`.
- LLM prompts are grouped in `src/lib/utils/inference/prompts/` (generic inference). The folder exposes an `index.ts` barrel that re-exports every file, so consumers import from the folder root (`@/lib/utils/inference/prompts`).

## Article Runner (the only orchestrator)

The app runs **one linear pipeline per article**:
`source → raw → article → analysis → title → category → embeddings`.

- There is **no** task model, workflow stack or template system. Do not
  reintroduce one: the whole point of the MVP runner is that an article is
  either analysed or it is not.
- `src/runners/articleRunner.ts` is the pipeline. `src/runners/articleSources.ts`
  holds the three extractors (`web`, `youtube`, `raw`).
- `src/runners/articleManager.svelte.ts` owns the **sequential** queue (one
  article at a time: the local `llama-server` is single threaded).
- `src/stores/articleStore.svelte.ts` holds the state of the open article
  (status, step, progress, title, categories, analysis). Preferences live in
  `viewState`.
- The body of an article is **never** in a store: it lives in
  `raw_content/<sha256(url)>.txt` and is read on demand through
  `src/lib/utils/rawContent.ts`.
- The analysis is persisted in `web_articles.summary` +
  `web_articles.analysis_divisor` and in one `article_windows` row per
  window. The executed window level is stored explicitly, never deduced from
  the number of windows.
- `viewState.windowLevel` is the index into `WINDOW_DIVISOR_LADDER`
  (`[1, 2, 4, 8, 16]`). It applies to raw text and YouTube; web articles
  split by markdown headings and have no knob.
- `DOCS/ArticleRunner.md` documents the pipeline in detail.

## Build, Lint, and Dev Commands

- Install JS deps: `bun install`
- Start frontend dev server: `bun run dev`
- Build frontend: `bun run build`
- Preview built frontend: `bun run preview`
- Run ESLint checks: `bun run lint`
- Format code with Prettier: `bun run format`
- Run JS/TS tests: `bun run test` (see `bun test <file>` for a single file)
- Run Svelte type checking in watch mode: `bun run check:watch`
- Start Tauri dev app: `bun run tauri dev`
- Start Linux Tauri dev with repo env flags: `bun run linux`
- Install dev `.desktop` icon for GNOME/Wayland: `bun run dev-icon` (remove: `bun run dev-icon:remove`)
- Run arbitrary Tauri CLI command: `bun run tauri <args>`

## Rust Commands

- Build Rust/Tauri backend directly: `cargo build --manifest-path src-tauri/Cargo.toml`
- Test Rust backend: `cargo test --manifest-path src-tauri/Cargo.toml`
- Run a single Rust test by name:
  `cargo test --manifest-path src-tauri/Cargo.toml test_split_markdown`
- List Rust tests:
  `cargo test --manifest-path src-tauri/Cargo.toml -- --list`

## Test Status

- JS/TS tests run on `bun test` (scripts: `test`, `test:watch`). Types come from `@types/bun`, wired via `"types": ["svelte", "bun"]` in `tsconfig.json`.
- Test files live next to the module under test as `*.test.ts` and import from `bun:test`.
- Run the whole suite: `bun run test`
- Run a single file: `bun test src/lib/utils/splitText.test.ts`
- Existing test files at time of writing: `src/lib/utils/splitText.test.ts`, `src/lib/utils/categoryText.test.ts`, `src/lib/utils/embeddingSearch.test.ts` (pure merge logic; see `src/lib/utils/embeddingSearch.ts`), `src/lib/utils/windowAnalysis.test.ts` (window ladder + split; the processor is imported dynamically so the module stays testable without the inference stack), `src/lib/utils/reasoningTags.test.ts`, `src/runners/shared/contextSizeError.test.ts`, `src/runners/shared/runCancellation.test.ts`
- Rust tests are unit tests embedded in their owning module via `#[cfg(test)] mod tests`.
- Known Rust tests at time of writing (all in `src-tauri/src/web_store.rs`, `web_store::tests`):
  - `query_articles_for_profile_orders_by_created_at_desc`
  - `query_categories_with_articles_orders_by_recent_and_paginates`
  - `query_categories_with_articles_respects_created_at_cutoff`
  - `query_categories_with_articles_breaks_ties_deterministically`
  - `category_exemplar_upsert_replaces_same_article_and_exposes_title`
  - `delete_category_rows_cascades_to_exemplars_and_links`
  - `category_exemplar_model_status_flags_stale_rows`
  - `migrate_clear_category_exemplars_drops_old_text_once`
  - `save_article_analysis_round_trips_and_replaces_windows`
  - `read_article_analysis_returns_none_for_unknown_article`
  - `list_articles_without_profile_filters_by_mode`
  - `upsert_article_row_updates_by_id_when_the_url_form_differs`
  - `upsert_article_row_inserts_when_no_row_matches_url_or_id`
- If you add JS/TS tests, also add explicit package scripts so future agents have a stable entry point.

## Database Workspaces

- Runtime data lives under `app_data_dir()/workspaces/<name>/`: `things.db`, `raw_content/`, `embeddings/` (LanceDB) and `media/`. `app_data_dir()/active.json` points at the active workspace.
- `src-tauri/src/db_manager.rs` owns path resolution, the one-time legacy migration (root-level `things.db` + friends move into `workspaces/default`), the `db_*` Tauri commands and ZIP export/import.
- New code that needs a database, media, raw-content or embeddings path must call the `db_manager` helpers instead of joining `app_data_dir()` directly.
- Switching databases (`dbState.switchTo`) reloads the webview on purpose so every in-memory store/cache is dropped.
- `db_manager::tests` covers name validation, archive root detection and export/import round-trips (including exporting inside the workspace).

# Always consider use hotkey as UX principle

## Hotkeys

- Use `@tanstack/svelte-hotkeys` (`createHotkey`) for keyboard shortcuts.
- Two patterns are used in this repo:

### Simple global hotkeys (always active while mounted)

Use a static options object. Common for media-player-style controls.

    createHotkey('Escape', handleStop, {
    	stopPropagation: true,
    	preventDefault: true
    });

## Validation Expectations

- For frontend TS/Svelte changes, usually run `bun run check` and the smallest relevant manual smoke test.
- For formatting-only edits, `bun run format` is enough.
- For Rust-only changes, run `cargo test --manifest-path src-tauri/Cargo.toml` when practical.
- For cross-boundary changes touching Tauri invokes and frontend callers, validate both TypeScript checks and relevant Rust tests.

## Svelte 5 Conventions

- Use runes-based APIs already present in the repo: `$props()`, `$state()`, `$derived()`, `$effect()`.
- Prefer the existing prop pattern:
  `let { value = defaultValue }: Props = $props();`
- Use `$bindable()` when a component is meant to support binding.
- Keep component state local unless it is truly shared application state.
- Prefer straightforward event handler functions over inline complex logic.
- Preserve existing `.component.svelte` naming where the repo already uses it.
- Keep styles inside the component when that is the local pattern.

## TypeScript Style

- Prefer TypeScript everywhere; avoid introducing `.js` files for new logic.
- Keep `strict`-mode safe code; do not silence errors with broad casts unless unavoidable.
- Prefer `interface` for object shapes already modeled as data contracts.
- Use `type` for unions, mapped types, helper aliases, and component-local concise shapes.
- Import types with `import type` to satisfy the ESLint `useImportType` rule.
- Reuse existing domain types from `src/types/` or nearby modules before creating new ones.
- Avoid `any`; if unavoidable, contain it narrowly and document the boundary.
- Prefer explicit return types on exported functions when they improve clarity.

## Import Conventions

- Group imports by source: framework/external first, then `@/` aliases, then relative imports.
- Keep type-only imports separate using `import type`.
- Prefer `@/` aliases for code under `src/` instead of long relative paths.
- Prompt folders use a barrel: import from the folder root rather than a single prompt file, so the call site stays stable when prompts move between files.
- Keep imports minimal; remove dead imports when touching a file.
- Do not reorder imports gratuitously in files you are not otherwise changing.

## Formatting Conventions

- Prettier is the formatter of record, ESLint is the linter.
- `.prettierrc` enforces tabs, LF line endings, single quotes, and no trailing commas.
- Match the surrounding file style if it differs slightly from ideal formatting.
- Keep lines reasonably readable; do not compress complex expressions for brevity.
- Avoid unrelated formatting churn in large files.

## Naming Conventions

- Components: PascalCase, e.g. `CategoryWidget.svelte`.
- Classes: PascalCase.
- Functions and variables: camelCase.
- Constants: UPPER_SNAKE_CASE when truly constant/shared, otherwise camelCase `const` is common.
- Store singletons often use `somethingStore` or `somethingState` naming; follow nearby patterns.
- File names are mixed in this repo; prefer matching the local folder convention over forcing a rename.
- Do not rename public or cross-file symbols unless the task requires it.

## Error Handling

- Fail with useful messages instead of swallowing context.
- Normalize unknown errors when surfacing them to UI or logs.
- In TS async code, prefer `try/catch` only when you can add context, recover, or update UI state.
- In UI code, avoid throwing raw non-`Error` values.
- In Rust, prefer `Result`-based flows and propagate context cleanly.
- Do not add noisy console logging unless it helps diagnose a real runtime path.
- Preserve user-visible behavior when tightening error handling.

## State and Data Flow

- Prefer deriving state with `$derived` instead of duplicating computed values.
- Keep store APIs focused; avoid adding global state for one component’s need.
- When mutating task/store structures, follow existing defensive-copy patterns where used.
- Maintain consistency between Tauri command names and frontend callers.
- If changing persisted shapes or database-facing data, check for downstream readers first.
- When introducing a user-facing constant (a magic number that affects behavior/UX), make it
  configurable instead of hardcoding it: expose it in `SettingsModal` or `VoiceSettingsModal`,
  placing it in an existing `Spacer` section when one fits, or adding a new `Spacer` section
  when none does.

### Conditional hotkeys (reactive enable/disable)

Use a reactive options function (getter) when the hotkey should only fire under certain conditions.

    const sHotkey = createHotkey(
    	'S',
    	async () => { /* handler */ },
    	() => ({
    		enabled: viewState.hoveredArticleUrl !== null,
    		ignoreInputs: true
    	})
    );

- Key names: single letters (`'S'`), named keys (`'Escape'`, `'Space'`), or arrows (`'ArrowRight'`).
- Use `ignoreInputs: true` to prevent hotkeys from firing while the user is typing in input fields.
- Use `stopPropagation: true` and `preventDefault: true` for global shortcuts that should not bubble.
- Assign the return value to a variable only when you need the reference; fire-and-forget calls are fine.

## Tauri and Rust Notes

- Frontend distribution path is produced by `bun run build` and consumed by Tauri.
- Tauri config lives in `src-tauri/tauri.conf.json`.
- Rust commands exposed to the frontend are registered in `src-tauri/src/lib.rs`.
- When adding a new Tauri command, update both the Rust invoke handler and the TS caller.
- Keep Rust changes focused; do not refactor unrelated modules while touching command plumbing.
- Follow existing Rust module organization rather than creating new layers prematurely.

### Linux app icon (GNOME / Wayland)

- On Wayland, GNOME ignores the window icon; the dock/Activities/Alt-Tab icon comes from an installed `.desktop` file matched by app id (`things`, verified via `WAYLAND_DEBUG=1 ... | grep set_app_id`), then `Icon=` from the icon theme.
- `tauri dev` installs neither, so the generic placeholder shows. Run `bun run dev-icon` to install a user-level `things.desktop` + icon (remove with `bun run dev-icon:remove`), then restart the dev app. `bin/install-dev-desktop.sh` does the work.
- `bundle.icon` in `tauri.conf.json` lists `icons/icon.png` first: Tauri's Linux codegen uses the first `.png` as the default window icon, so ordering controls icon resolution on X11.
- Do not set `app.enableGTKAppId` to `true` without a custom desktop template: the bundler emits `StartupWMClass=<exec name>` (`things`), and switching the app id to the identifier would break Wayland icon matching.

## What To Avoid

- Do not “fix ESLint” repo-wide unless explicitly asked.
- Do not edit `LEGACY/` or `PLANS/` as part of normal work.
- Do not introduce a new formatter or lint tool.
- Do not add backward-compatibility code unless there is a concrete persisted-data or external-callsite reason.
- Do not convert established local patterns just for consistency theater.

## When Adding Tests

- Put Rust unit tests near the Rust module they cover.
- If introducing JS tests, prefer a single well-supported runner and add scripts in `package.json`.
- Document a single-file or single-test invocation in this file when you add that runner.
- Keep tests targeted; prefer one focused regression test over broad snapshot coverage.

## Agent Workflow

- Read nearby files before editing to match local patterns.
- Make the smallest correct change first.
- Verify with the narrowest relevant command set.
- Mention any missing test infrastructure rather than pretending coverage exists.
- If repository instructions change, update this file so future agents inherit the new rules.
