# Migration from ChromaDB to Leann FastAPI Server

This document summarizes the complete migration from using ChromaDB for embeddings to using a Leann FastAPI server.

## Overview

The application has been refactored to use the **Leann vector database** with a **FastAPI wrapper** instead of ChromaDB. This provides:
- Better storage optimization (97% reduction with embedding recomputation)
- Modern vector search with HNSW backend
- OpenAI-compatible embedding endpoints
- Simple, clean REST API

## Changes Made

### 1. New Leann API Wrapper Module (`src/lib/utils/leann.ts`)

**Created new file** with TypeScript wrapper functions for the Leann FastAPI server:

- **`saveDocumentsToLeann(documents, metadata?)`** - Save documents with metadata to the Leann index
  - Replaces the old `storeEmbeddings` Tauri command
  - Documents can have individual metadata that gets merged with call-level metadata
  
- **`searchDocumentsInLeann(params)`** - Search the Leann index with semantic queries
  - Supports all Leann search parameters (complexity, beam_width, pruning, etc.)
  - Returns array of `LeannSearchResult` objects with id, text, score, and metadata

- **`similaritySearchCompat(params)`** - ChromaDB-compatible search adapter
  - Converts Leann results to ChromaDB format for backward compatibility
  - Used by existing code that expects ChromaDB response structure
  
- **`checkLeannHealth()`** - Health check for the Leann API server

#### Environment Configuration

The Leann API URL can be configured via:
```
VITE_LEANN_API_URL=http://your-leann-server:3008
```

Defaults to `http://localhost:3008` if not set.

### 2. Updated ChromaDB Wrapper (`src/lib/utils/chromadb.ts`)

**Converted to re-export module** that bridges to Leann:

- Now re-exports Leann functions as the ChromaDB API
- `storeEmbeddings` → `saveDocumentsToLeann`
- `similaritySearch` → `similaritySearchCompat` (with ChromaDB format conversion)
- Maintains backward compatibility with existing code

### 3. Updated URL Router (`src/lib/urlRouter.ts`)

**Modified document saving flow:**

```typescript
// Before:
await storeEmbeddings({
  texts: docs,
  metadata: { category, articleId },
  articleId,
  collectionName: "articles"
});

// After:
const documents = docs.map(text => ({
  text,
  metadata: { 
    source: isYouTube ? 'youtube' : 'article',
    category,
    articleId: String(newArticle.id),
    url,
    title
  }
}));

await storeEmbeddings({ documents });
```

Changes:
- Transforms text chunks into document objects with metadata
- Adds richer metadata (source, url, title)
- Error handling for embedding storage doesn't block article save

### 4. Updated YouTube Transcript Handler (`src/lib/getYouTubeTranscript.ts`)

**Removed ChromaDB import:**
- Removed unused `storeEmbeddings` and `similaritySearch` imports
- The embedding storage now happens in `urlRouter.ts` with unified handling

### 5. Removed Tauri Commands (`src-tauri/src/lib.rs`)

**Removed ChromaDB module binding:**

```rust
// Removed:
mod chromadb;
pub use crate::chromadb::{store_embeddings, similarity_search};

// From invoke_handler:
// - store_embeddings
// - similarity_search
```

This removes the Tauri command bridge since the application now communicates directly with the FastAPI server via HTTP.

### 6. Retained Rust Code

The Rust ChromaDB module (`src-tauri/src/chromadb.rs`) is not compiled but kept for reference or future use.

## API Differences

### ChromaDB API (Old)
```typescript
// Save embeddings
await invoke('store_embeddings', {
  texts: string[],
  metadata: Record<string, unknown>,
  articleId: string,
  collectionName: string
})

// Search
const results = await invoke('similarity_search', {
  queryText: string,
  nResults: number,
  whereMetadata?: object,
  collectionName: string
})
// Returns: { ids, distances, documents, metadatas }
```

### Leann API (New)
```typescript
// Save documents
await saveDocumentsToLeann({
  documents: [
    { text: string, metadata?: object },
    ...
  ]
})
// Returns: { status, action, count, index_path }

// Search (native)
const results = await searchDocumentsInLeann({
  question: string,
  top_k?: number,
  complexity?: number,
  recompute_embeddings?: boolean,
  ...advancedParams
})
// Returns: LeannSearchResult[]

// Search (ChromaDB-compatible)
const results = await similaritySearchCompat({
  queryText: string,
  nResults?: number,
  whereMetadata?: object,
  ...
})
// Returns: { ids[][], distances[][], documents[][], metadatas[][] }
```

## Configuration

### Leann Server Setup

Before using this application, ensure the Leann FastAPI server is running:

```bash
# Start the Leann server
python -m apps.api

# Server runs at http://0.0.0.0:3008
# Docs at http://localhost:3008/docs
```

### Environment Variables

Set in `.env` or `.env.local`:

```bash
# Leann API server URL (optional, defaults to http://localhost:3008)
VITE_LEANN_API_URL=http://localhost:3008

# Leann embedding model (set on server side)
LEANN_EMBEDDING_MODEL=BAAI/bge-small-en-v1.5

# OpenAI-compatible embedding endpoint (set on server side)
OPENAI_BASE_URL=http://localhost:8080/v1
OPENAI_API_KEY=sk-dummy
```

## Type Definitions

All key interfaces are exported from `src/lib/utils/chromadb.ts` for use throughout the application:

- `LeannDocument` - Document structure for indexing
- `SaveDocumentsParams` - Parameters for saving
- `SaveDocumentsResponse` - Response from save operation
- `LeannSearchResult` - Individual search result
- `SearchDocumentsParams` - Parameters for Leann native search
- `SimilaritySearchParams` - Parameters for ChromaDB-compatible search
- `SimilaritySearchResult` - ChromaDB-compatible result format

## Error Handling

Both APIs now properly handle errors:

```typescript
try {
  await storeEmbeddings({ documents });
} catch (error) {
  console.error('Failed to store embeddings:', error);
  // Continues without blocking article save
}
```

## Benefits of This Migration

1. **Reduced Storage**: 97% storage savings with embedding recomputation
2. **Modern Vector DB**: HNSW backend with better search performance
3. **Flexible Embeddings**: OpenAI-compatible API supports multiple providers
4. **Simpler Architecture**: Direct HTTP API instead of Tauri IPC
5. **Better Metadata**: Richer document metadata for better search filtering
6. **Backward Compatible**: Existing code continues to work with adapter functions

## Testing

To test the integration:

1. Start the Leann API server
2. Update `VITE_LEANN_API_URL` if server is on different host
3. Create/process articles - embeddings should be saved to Leann
4. Search in chat - results should come from Leann via the search adapter
5. Check Leann API docs at http://localhost:3008/docs for endpoints

## Future Improvements

1. Add metadata filtering to `searchDocumentsInLeann` calls
2. Implement caching for frequently searched queries
3. Add retry logic with exponential backoff for API failures
4. Monitor search quality and adjust embedding parameters
5. Add admin endpoints for index management and analytics
