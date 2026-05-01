# AGENTS.md

dont run `biome check`

## Purpose
- This file is for coding agents working inside this repository.
- Prefer small, local changes that preserve existing behavior and structure.
- Do not spend time fixing unrelated Biome warnings or performing broad cleanup.
- Ignore `LEGACY/` and `PLANS/` unless the task explicitly points there.

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

## Working Areas
- Frontend routes and UI live in `src/routes/` and `src/components/`.
- Shared TS utilities live under `src/lib/`, `src/stores/`, `src/runners/`, and `src/types/`.
- Tauri Rust code lives under `src-tauri/src/`.
- Database, Tauri capabilities, and app config live in `src-tauri/`.

## Build, Lint, and Dev Commands
- Install JS deps: `bun install`
- Start frontend dev server: `bun run dev`
- Build frontend: `bun run build`
- Preview built frontend: `bun run preview`
- Run Biome checks: `bun run check`
- Run Biome linter only: `bun run lint`
- Format code with Biome: `bun run format`
- Run Svelte type checking in watch mode: `bun run check:watch`
- Start Tauri dev app: `bun run tauri dev`
- Start Linux Tauri dev with repo env flags: `bun run linux`
- Run arbitrary Tauri CLI command: `bun run tauri <args>`

## Rust Commands
- Build Rust/Tauri backend directly: `cargo build --manifest-path src-tauri/Cargo.toml`
- Test Rust backend: `cargo test --manifest-path src-tauri/Cargo.toml`
- Run a single Rust test by name:
  `cargo test --manifest-path src-tauri/Cargo.toml test_split_markdown`
- List Rust tests:
  `cargo test --manifest-path src-tauri/Cargo.toml -- --list`

## Test Status
- There is currently no JS test runner configured in `package.json`.
- No frontend `*.test.*` or `*.spec.*` files were found.
- Current automated tests are Rust unit tests in `src-tauri/src/splitter.rs`.
- Known Rust tests at time of writing:
  `test_split_markdown`
  `test_split_podcast`
  `test_split_code_ts`
  `test_split_with_overlap`
  `test_invalid_overlap`
  `test_zero_capacity`
- If you add JS/TS tests, also add explicit package scripts so future agents have a stable entry point.

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
- Import types with `import type` to satisfy the Biome `useImportType` rule.
- Reuse existing domain types from `src/types/` or nearby modules before creating new ones.
- Avoid `any`; if unavoidable, contain it narrowly and document the boundary.
- Prefer explicit return types on exported functions when they improve clarity.

## Import Conventions
- Group imports by source: framework/external first, then `@/` aliases, then relative imports.
- Keep type-only imports separate using `import type`.
- Prefer `@/` aliases for code under `src/` instead of long relative paths.
- Keep imports minimal; remove dead imports when touching a file.
- Do not reorder imports gratuitously in files you are not otherwise changing.

## Formatting Conventions
- Biome is the formatter/linter of record.
- `biome.json` enforces tabs, LF line endings, double quotes, and ES5 trailing commas.
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

## Tauri and Rust Notes
- Frontend distribution path is produced by `bun run build` and consumed by Tauri.
- Tauri config lives in `src-tauri/tauri.conf.json`.
- Rust commands exposed to the frontend are registered in `src-tauri/src/lib.rs`.
- When adding a new Tauri command, update both the Rust invoke handler and the TS caller.
- Keep Rust changes focused; do not refactor unrelated modules while touching command plumbing.
- Follow existing Rust module organization rather than creating new layers prematurely.

## What To Avoid
- Do not “fix Biome” repo-wide unless explicitly asked.
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
