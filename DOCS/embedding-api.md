# Embedding Store API

Vector similarity search over article chunks using LanceDB, exposed as Tauri commands.

## Tables

Three tables share the same schema: `summaries`, `keywords`, `questions`. Tables are created dynamically on first write.

## Schema

| Column | Type | Nullable | Description |
|---|---|---|---|
| `id` | `Utf8` | No | UUID (auto-generated) |
| `article_url` | `Utf8` | No | Source article URL |
| `chunk_text` | `Utf8` | No | Text content of the chunk |
| `embedding` | `FixedSizeList<Float32>` | No | Vector embedding |
| `created_at` | `Int64` | No | Epoch millis |
| `category` | `Utf8` | Yes | Article category |
| `profile_id` | `Utf8` | Yes | Profile ID |
| `model_name` | `Utf8` | Yes | Embedding model name |
| `model_dimensions` | `Int32` | Yes | Embedding dimensions |
| `start_offset` | `Int32` | Yes | Character offset start in source text |
| `end_offset` | `Int32` | Yes | Character offset end in source text |

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
  category: 'tech',       // optional filter
  profileId: 'abc',       // optional filter
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

## Rust Commands

Registered in `src-tauri/src/lib.rs`, implemented in `src-tauri/src/embedding_store.rs`.

| Tauri Command | TS Wrapper |
|---|---|
| `index_chunks` | `indexChunks()` |
| `search_similar_chunks` | `searchChunks()` |
| `delete_chunks_by_article` | `deleteChunksByArticle()` |
| `delete_chunk` | `deleteChunk()` |

## Storage

LanceDB database is stored under the Tauri app data directory in `embeddings/`. Each table is a separate LanceDB table within the same database.
