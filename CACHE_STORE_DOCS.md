# Cache Store Documentation

## Overview

The **cacheStore** (implemented as `storeCacheWrapper`) is a Svelte store utility that provides a segmented caching mechanism for async data fetching. It manages data loading, error handling, and cache invalidation in a reactive, type-safe manner.

## Features

- **Segmented Caching**: Each cache segment is identified by a unique key combining segment name and parameters
- **Loading State**: Tracks whether data is currently being fetched
- **Error Handling**: Captures and stores errors that occur during data fetching
- **Cache Invalidation**: Allows selective invalidation of cache segments to force fresh data
- **Timestamp Tracking**: Records when each segment was last updated
- **Type-Safe**: Full TypeScript support with generic types for data and parameters

## API

### `storeCacheWrapper<T, Tparams>(fetcher)`

Creates a segmented cache store.

**Parameters:**
- `fetcher: (segment: string, params: Tparams) => Promise<T>` - Async function to fetch data for a given segment and parameters

**Returns:**
An object with the following methods:

#### `subscribe(callback)`
Standard Svelte store subscription method. Callback receives the current state:
```typescript
{
  segments: Record<string, SegmentState<T>>
}
```

#### `load(segment, params, force?)`
Loads data for a specific segment with given parameters.

- `segment: string` - Segment identifier (key-space)
- `params: Tparams` - Parameters to pass to the fetcher function
- `force?: boolean` - Force reload (optional, defaults to `false`)

Sets `loading: true` during fetch, then updates with data or error.

#### `invalidate(segment, params)`
Invalidates a cache segment and triggers a fresh reload.

- `segment: string` - Segment identifier
- `params: Tparams` - Parameters identifying the cache entry

Clears the cached data and automatically calls `load()` to refresh.

## Segment State Structure

Each cached segment contains:

```typescript
{
  data: T | null,           // The cached data (null if loading or errored)
  loading: boolean,         // Whether data is currently being fetched
  error: any,               // Error object if fetch failed
  last: number              // Timestamp of last successful update
}
```

## Usage Example

```typescript
// Create a cache store for fetching article data
const articleCache = storeCacheWrapper<Article, { url: string }>(
  async (segment, params) => {
    const response = await fetch(`/api/articles?url=${params.url}`);
    return response.json();
  }
);

// Load data for a segment
await articleCache.load('article', { url: 'example.com/post' });

// Subscribe to cache updates
articleCache.subscribe(cache => {
  const state = cache.segments['article-{"url":"example.com/post"}'];
  console.log(state.data, state.loading, state.error);
});

// Invalidate and refresh specific cache entry
articleCache.invalidate('article', { url: 'example.com/post' });
```

## Key Benefits

1. **Independent Segment Management**: Each cache segment can be loaded and invalidated independently
2. **Reactive Updates**: Seamless integration with Svelte components via store subscriptions
3. **Error Isolation**: Errors in one segment don't affect others
4. **Memory Efficient**: Only stores necessary state for cached data
5. **Flexible Caching**: Works with any fetcher function and data type
