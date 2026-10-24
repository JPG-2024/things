# Embedding Store API

Vector similarity search over article chunks using LanceDB, exposed as Tauri commands.

## Tables

There is no fixed set of tables: **a task indexes into the table named by `task.embedTable ?? task.id`** (see `taskEmbeddingTable` in `src/lib/utils/embeddingSearch.ts`). The default analysis task indexes into `summary` (Settings → Embeddings → "Embedding table"), regardless of the configured analysis processor — `multi`, `analysisTopic` or `windowSummary` all produce a `summary` per chunk, so the table always holds window summaries. Other table names (`analysis`, …) are legacy data or task ids from older runs. `category_exemplars` holds the category-classification exemplar vectors and is not a chunk table.

Tables are created dynamically on first write. Searching a table that does not exist yet is a safe no-op for the frontend wrappers (the rejected `searchChunks` call is caught by the search helpers and yields no results).

## Schema

| Column             | Type                     | Nullable | Description                                                                                                                                                           |
| ------------------ | ------------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`               | `Utf8`                   | No       | UUID (auto-generated)                                                                                                                                                 |
| `article_url`      | `Utf8`                   | No       | Source article URL                                                                                                                                                    |
| `chunk_text`       | `Utf8`                   | Yes      | Text content of the chunk. Usually left `null` at index time; `search_similar_chunks` reconstructs it from the raw article content using `start_offset`/`end_offset`. |
| `embedding`        | `FixedSizeList<Float32>` | No       | Vector embedding                                                                                                                                                      |
| `created_at`       | `Int64`                  | No       | Epoch millis                                                                                                                                                          |
| `category`         | `Utf8`                   | Yes      | Article category                                                                                                                                                      |
| `profile_id`       | `Utf8`                   | Yes      | Profile ID                                                                                                                                                            |
| `model_name`       | `Utf8`                   | Yes      | Embedding model name                                                                                                                                                  |
| `model_dimensions` | `Int32`                  | Yes      | Embedding dimensions                                                                                                                                                  |
| `start_offset`     | `Int32`                  | Yes      | Character offset start in source text                                                                                                                                 |
| `end_offset`       | `Int32`                  | Yes      | Character offset end in source text                                                                                                                                   |

## TypeScript API

All functions are in `src/lib/utils/embeddingStore.ts`.

### `indexChunks(table, chunks)`

Index chunks into a table. Creates the table + vector index if it doesn't exist. If the table exists, deletes existing chunks for the same `articleUrl` before inserting (incremental per-article upsert).

```typescript
await indexChunks('analysis', [
  {
    articleUrl: 'https://example.com/article',
    chunkText: 'First chunk of text...',
    embedding: [0.1, 0.2, ...],
    startOffset: 0,
    endOffset: 500,
  }
]);
```

### `searchChunks(params)`

Vector similarity search with optional filters.

```typescript
const results = await searchChunks({
	table: 'analysis',
	embedding: queryVector,
	limit: 10,
	category: 'tech', // optional filter
	profileId: 'abc' // optional filter
});
```

Returns `SearchChunkResult[]` sorted by distance (ascending).

### `deleteChunksByArticle(table, articleUrl)`

Delete all chunks belonging to an article in a table.

```typescript
await deleteChunksByArticle('analysis', 'https://example.com/article');
```

### `deleteChunk(table, id)`

Delete a single chunk by ID.

```typescript
await deleteChunk('analysis', 'uuid-here');
```

## Retrieving context (chat RAG)

`ChatModal` retrieves chunks similar to the user's message and injects them,
numbered, ahead of the question so the model can cite `[1]`, `[2]`… The hits
are rendered per assistant message by `SimilarEmbeddingsComponent` in
"external results" mode (`results` + `label="Sources"`).

The retrieval lives in `src/lib/utils/embeddingTasks.ts`:

- `retrieveContextChunks({ tables, query, limit?, maxDistance?, maxResults?, excludeArticleUrl? })`
  embeds the query once and searches each table in parallel; missing tables and
  failed requests resolve to no results (retrieval is best-effort, never a hard
  dependency).
- `mergeSearchResults(groups, { excludeArticleUrl?, maxDistance?, maxResults? })`
  is the pure merge/rank step (dedupe by id → exclude article → sort by
  distance → distance cutoff → cap), re-exported from `embeddingRanking.ts` so
  it can be unit tested (`bun test src/lib/utils/embeddingTasks.test.ts`).

Settings (persisted in the `view` section of `settings.json`): `chatSearchEnabled`
master switch, `chatSearchTables` (comma-separated tables, default `summary`),
`chatSearchMaxResults` (default 5) and `chatSearchMaxDistance` (default 0.6).
The chat header's `FileDigit` toggle flips the same persisted switch for the
session.

Where chunks are **indexed** is a separate knob: Settings → Embeddings
(`embeddingTable`, default `summary`; `embeddingField`, default `summary`;
`embeddingStoreChunkText`) — defaults for tasks created from now on. The chat
reads `summary`; writing the chat's `chatSearchTables` to the same value keeps
them in sync.

`search_similar_chunks` uses LanceDB's default **L2** distance (unlike
`search_similar_category_exemplars`, which uses cosine) — the distance
thresholds above are L2 values.

## Generating embeddings from tasks

A task can be marked for automatic indexing by setting `embeddings: true` on its
definition (e.g. `createRecursiveContentTask({ embeddings: true })`).
The task's `id` is used as the LanceDB table name.

After a run, `generateEmbeddingsFromTasks(tasks, articleUrl, { model, profileId?, category? })`
(from `src/lib/utils/embeddingTasks.ts`) scans the tasks: for each one with `embeddings: true` whose result is recursive-shaped (`chunks` + `chunkOffsets`
arrays), it batch-embeds `data.chunks` via `createEmbeddings` and writes the
chunks (without `chunkText`, with offsets) through `indexChunks`.

`youTubeRunner`, `webRunner` and `rawRunner` call this automatically inside their
`onRunResult` after persisting tasks. The embedding model is `EMBEDDING_MODEL`
(default `bge-m3`) in `src/lib/utils/inference/constants.ts`.

```typescript
import { generateEmbeddingsFromTasks } from '@/lib/utils/embeddingTasks';

await generateEmbeddingsFromTasks(runResult.tasks, articleUrl, {
	model: 'bge-m3',
	profileId,
	category
});
```

Only recursive tasks are handled for now; other task shapes are skipped.

## Generating embeddings from text

Embeddings are produced by the local llama-server (OpenAI-compatible
`/v1/embeddings` endpoint). The TypeScript wrapper `createEmbeddings` lives in
`src/lib/utils/inference/llama-completions.ts` and is re-exported from the
inference module.

```typescript
import { createEmbeddings, LlamaEmbeddingsError } from '@/lib/utils/inference/llama-completions';
import { indexChunks } from '@/lib/utils/embeddingStore';
import { splitForEmbeddings } from '@/lib/utils/splitText';

// Generate vectors, then index them as chunks.
async function embedAndIndex(
	articleUrl: string,
	text: string,
	model: string,
	table = 'analysis'
): Promise<number> {
	const pieces = splitForEmbeddings(text, { windowSize: 1000, overlap: 100 });
	const response = await createEmbeddings({ model, input: pieces.map((p) => p.text) });

	const ordered = [...response.data].sort((a, b) => a.index - b.index);

	const chunks = pieces.map((p, i) => ({
		articleUrl,
		chunkText: p.text,
		embedding: ordered[i].embedding,
		startOffset: p.startOffset,
		endOffset: p.endOffset,
		modelName: model,
		modelDimensions: ordered[i].embedding.length
	}));

	return indexChunks(table, chunks);
}
```

### Notes

- `createEmbeddings` posts to `${VITE_LLAMA_URL}/v1/embeddings` (defaults to
  `http://localhost:8083`). The `model` must be an embedding model served by
  that llama-server instance.
- `LlamaEmbeddingsError` is thrown if the server is unreachable or returns a
  non-2xx response.
- `splitForEmbeddings` returns char-based `startOffset`/`endOffset` values
  relative to the original `text` (including leading-whitespace trim). These
  match the offsets `search_similar_chunks` uses to reconstruct chunk text
  from raw content (`embedding_store.rs`).
- `input` accepts either a single string or an array of strings (batched).

## Rust Commands

Registered in `src-tauri/src/lib.rs`, implemented in `src-tauri/src/embedding_store.rs`.

| Tauri Command              | TS Wrapper                |
| -------------------------- | ------------------------- |
| `index_chunks`             | `indexChunks()`           |
| `search_similar_chunks`    | `searchChunks()`          |
| `delete_chunks_by_article` | `deleteChunksByArticle()` |
| `delete_chunk`             | `deleteChunk()`           |

## Storage

LanceDB database is stored under the Tauri app data directory in `embeddings/`. Each table is a separate LanceDB table within the same database.
