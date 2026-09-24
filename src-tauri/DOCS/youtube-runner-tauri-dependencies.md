# YouTube Runner — Tauri Backend Dependencies

Tauri `invoke` commands reachable from `src/runners/youtube/youTubeRunner.ts`,
including those reached transitively through its imported helpers.

## Invoke surface

| # | Invoke command | Called from | What it does (backend) |
|---|---|---|---|
| 1 | `get_youtube_transcript_timed` | `timed-captions` task (direct `invoke`) | Fetches timed YouTube captions for the video id, trying `en` then `es`; emits `flow-status` events; returns `CaptionEntry[]`. |
| 2 | `url_to_folder_name` | `downloadImageUrl` → `resolveMediaDirectory` (thumbnail task, profile image) | Returns the media subfolder name (currently hardcoded `"thumbnails"`). |
| 3 | `download_and_save_image` | `downloadImageUrl` (thumbnail task, profile image) | Downloads the image via `reqwest`, hashes the URL to a filename, optionally shrinks it, saves `.webp` under app-local `media/thumbnails/`; returns the filename. |
| 4 | `get_web_store_article_by_url` | `fetchYouTubeProfileInBackground` and `saveArticle`/`saveTasks` → `getArticleWithTasksByUrl` | Reads one article row by URL (for existing profile id / existing field merge). |
| 5 | `get_web_store_tasks_by_url` | `getArticleWithTasksByUrl`, `saveTasks` (merge path) | Reads the persisted tasks JSON for a URL. |
| 6 | `get_web_store_domain` | `getProfile` (existing article's profile lookup) | Reads a domain record by id. |
| 7 | `get_web_store_profile` | `getProfile` fallback | Reads a profile (channel) record by id. |
| 8 | `get_web_profile_template` | `runTemplateWorkflow` → `getProfileTemplateId` | Resolves which template is assigned to the profile/domain. |
| 9 | `get_web_store_template` | `runTemplateWorkflow` → `getTemplate` | Loads the template definition (its task list). |
| 10 | `upsert_web_store_article` | `saveArticle` | Inserts/updates article metadata (title, thumbnail, directory, profile, embedding source text, date, templateId). |
| 11 | `assign_categories_to_article` | `saveArticle` (only if a `category` task produced names) | Links the article to category ids. |
| 12 | `write_raw_content` | `saveTasks` → `wrapRawContentRef` (for the `content` task) | Stores large raw content out-of-line and returns a key reference. |
| 13 | `upsert_web_store_tasks` | `saveTasks` | Inserts/updates the merged persisted tasks JSON for the URL. |
| 14 | `upsert_web_store_profile` | `saveProfile` (normal case: channel id ≠ `youtube.com`) | Inserts/updates the channel profile record (picture, url, domain). |
| 15 | `upsert_web_store_domain` | `saveProfile` → `saveDomain` (only if profile id equals the domain id) | Inserts/updates a domain record. |
| 16 | `index_chunks` | `generateEmbeddingsFromTasks` (only when `viewState.embeddingsEnabled`) | Indexes embedding chunks into the LanceDB table named after the task, replacing that article's existing chunks. |
| 17 | `read_raw_content` | `getArticleWithTasksByUrl` → `parsePersistedTaskStates` (conditional) | Re-hydrates a stored `content` task when its data is a raw-content reference key. |

## Notes

- **Task-level flow:** the runner's own tasks (`init-youtube`, `thumbnail`, `content`) are pure JS. Only `timed-captions` calls an invoke directly; `thumbnail` reaches the backend through `downloadImageUrl`.
- **Template/default tasks don't add invokes:** template tasks are `ia`/`extractor`/`script recursive` and use `chatCompletions` over HTTP to llama-server, not Tauri `invoke`.
- **Not invokes (but backend-adjacent):** `createEmbeddings` (HTTP to `VITE_EMBEDDINGS_URL`), `scrapStore.getProfileInfoFromVideo` (HTTP to `VITE_SCRAPER_API_URL`), and `getMediaSrc`/`convertFileSrc` (Tauri asset protocol, not a command).
- **Conditional paths:** `read_raw_content` (#17) only fires when a cached content task uses the raw-content ref shape; `assign_categories_to_article` (#11) only when a category task emitted names; `index_chunks` (#16) only when embeddings are enabled; #14 vs #15 depends on the profile/domain id.
- **Not reachable here:** `filter_existing_article_urls`, `list_web_store_tasks`, `list_web_store_articles`, and the delete commands live in other store methods this runner doesn't call.
