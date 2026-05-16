# Notian — Turn Any Link Into Insight

Notian is a privacy‑first, desktop app that turns links into structured notes and instant summaries. Paste or copy a URL and Notian will fetch the page exactly as a browser does, extract the main content and metadata, convert it to clean Markdown, and stream a concise AI summary in real time.

## What makes it unique

- Local-first and secure: Built on Tauri (Rust + SvelteKit) with a deny-by-default capability model. The UI can only do what it’s explicitly allowed to do.
- Clipboard-driven workflow: Copy a URL anywhere; Notian listens and auto-runs the right flow (blog/article vs. YouTube) with zero friction.
- “What-you-see” extraction: Uses a real Chromium automation layer with anti‑detect hardening (custom UA + stealth script) to load pages like a real user—more resilient than plain HTTP scraping.
- Clean Markdown, not noise: Converts only the meaningful content (selectors like `article`/`main`, with intelligent fallbacks), skipping headers/nav/scripts/styles.
- Streaming insights: Summaries stream token-by-token via the OpenRouter API, so you don’t wait for a full response to start reading.
- Typed event bus for UX: Progress and results are emitted as structured events (metadata and markdown), enabling responsive UI states and clear feedback.

## What it does today

- Extracts articles and blogs
  - Loads the page in a hardened headless Chromium context
  - Pulls metadata (title, description, OpenGraph fields)
  - Converts the main content to Markdown with noise reduction
  - Optionally saves the main preview image (og:image) to your local `~/notian/images`
- Summarizes with AI
  - Streams a short, readable summary (currently Spanish prompt by default; easily configurable)
- Handles YouTube links
  - Fetches video transcripts (multi‑language fallback)
  - Streams a brief title + bullet key points summary
- Simple, reactive desktop UI
  - Shows progress, description, and main image as they arrive
  - Works entirely as a native-feeling app with a tiny footprint

## Why it matters

- Captures the web “as seen” rather than relying on brittle HTML scraping alone
- Produces Markdown that’s ready for knowledge bases, wikis, or note apps
- Cuts the friction from reading-to-notes with a single copy/paste action
- Keeps sensitive workflows local while using cloud AI only for summarization

## Potential and roadmap ideas

- Rich exporters: Obsidian/Joplin/Notion export, front‑matter templating, and per‑site content presets.
- Batch and queues: Paste multiple links or watch a folder/clipboard history to process in bulk.
- Highlighting and citations: Preserve headings/links and auto‑append sources and timestamps.
- Multilingual controls: Pick summary language, tone, and length; site‑specific prompts.
- RAG and local search: Vector embedding of extracted notes for offline semantic search.
- More content types: Instagram/Twitter threads, PDFs, and newsletters.
- Rules & automations: If‑this‑then‑that actions per domain (save images, tag, route to notebook, etc.).

## How it works (high level)

1. Clipboard or URL input triggers a route:
   - YouTube → transcript → AI summary
   - Everything else → metadata + Markdown extraction → AI summary
2. Rust backend (Tauri) drives a Chromium instance, loads the target page, and returns the parsed HTML.
3. The backend extracts metadata and converts the main content to Markdown, then emits progress/results events.
4. An AI call (via OpenRouter) streams a concise summary back into the UI.

## Tech at a glance

- Desktop: Tauri (Rust) + SvelteKit (TypeScript)
- Browser automation: chromiumoxide with anti‑detect configuration
- Markdown conversion: `htmd` (skip noisy tags; selectors with fallback)
- YouTube transcripts: `yt-transcript-rs`
- AI inference: OpenRouter streaming completions

---

Notian is designed to be fast, reliable, and delightful for knowledge workers who live between the browser and their notes. If you capture links, you’ll ship better notes—with less effort.
