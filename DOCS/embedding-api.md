# Embedding Store API

Vector similarity search over article chunks using LanceDB, exposed as Tauri commands.

## Tables

Three tables share the same schema: `summaries`, `keywords`, `questions`. Tables are created dynamically on first write.

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
await indexChunks('summaries', [
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
	table: 'summaries',
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
await deleteChunksByArticle('keywords', 'https://example.com/article');
```

### `deleteChunk(table, id)`

Delete a single chunk by ID.

```typescript
await deleteChunk('questions', 'uuid-here');
```

## Generating embeddings from tasks

A task can be marked for automatic indexing by setting `embeddingTable` on its
definition (e.g. `createRecursiveContentTask({ embeddingTable: 'summaries' })`).
The value is any string and selects (creating if needed) the LanceDB table.

After a run, `generateEmbeddingsFromTasks(tasks, articleUrl, { model, profileId?, category? })`
(from `src/lib/utils/embeddingTasks.ts`) scans the tasks: for each one with an
`embeddingTable` whose result is recursive-shaped (`chunks` + `chunkOffsets`
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
	table = 'summaries'
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
