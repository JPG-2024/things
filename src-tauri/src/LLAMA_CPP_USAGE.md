# LlamaCpp Unix Socket Integration

## Overview

This module provides Tauri commands to connect to an existing `llama-server` via Unix Domain Socket (UDS) for streaming text completion and embeddings generation.

## Prerequisites

1. **Start llama-server with Unix socket:**

```bash
# Start llama-server with Unix socket enabled
llama-server \
  --model /path/to/model.gguf \
  --unix-socket /tmp/llama.sock \
  --ctx-size 4096 \
  --threads 8
```

2. **Verify socket exists:**

```bash
ls -la /tmp/llama.sock
# Should show: srwxr-xr-x ... /tmp/llama.sock
```

## Rust API

### Commands

#### `llama_cpp_completion_stream`
Streams text completion token-by-token via events.

**Parameters:**
- `socket_path: Option<String>` - Socket path (defaults to `/tmp/llama.sock`)
- `model: String` - Model identifier
- `prompt: String` - User prompt
- `system: Option<String>` - System prompt
- `temperature: Option<f32>` - Sampling temperature (0.0-2.0)
- `max_tokens: Option<u32>` - Maximum tokens to generate

**Events:**
- `llama-cpp-stream` - Stream progress events
- `llama-cpp-error` - Error events

#### `llama_cpp_embeddings`
Generate embeddings for batch of texts.

**Parameters:**
- `socket_path: Option<String>` - Socket path
- `model: String` - Model identifier
- `texts: Vec<String>` - Texts to embed

**Returns:** `Vec<Vec<f32>>` - Array of embedding vectors

#### `llama_cpp_health_check`
Check if llama-server is reachable.

**Parameters:**
- `socket_path: Option<String>` - Socket path

**Returns:** `bool` - Health status

## TypeScript/JavaScript API

### Import

```typescript
import {
  streamCompletion,
  generateEmbeddings,
  healthCheck
} from '@/lib/services/llamaCppService';
```

### Examples

#### 1. Streaming Completion

```typescript
// Basic streaming
const unlisten = await streamCompletion(
  {
    model: 'llama',
    prompt: 'Explain quantum computing in simple terms',
    system: 'You are a helpful science teacher',
    temperature: 0.7,
    maxTokens: 512
  },
  (token) => {
    // Called for each token
    console.log(token);
  },
  (error) => {
    // Called on error
    console.error('Error:', error);
  }
);

// Clean up when done
// unlisten();
```

#### 2. Streaming with State Management

```typescript
import { writable } from 'svelte/store';

const responseStore = writable('');

async function generateResponse(prompt: string) {
  responseStore.set('');
  
  const unlisten = await streamCompletion(
    {
      model: 'llama',
      prompt,
      temperature: 0.7
    },
    (token) => {
      responseStore.update(current => current + token);
    },
    (error) => {
      console.error('Stream error:', error);
    }
  );
  
  return unlisten;
}
```

#### 3. Generate Embeddings

```typescript
// Single text
const embeddings = await generateEmbeddings({
  model: 'llama',
  texts: ['Hello world']
});
console.log('Embedding vector:', embeddings[0]);

// Batch processing
const texts = [
  'The quick brown fox',
  'jumps over the lazy dog',
  'Machine learning is fascinating'
];

const batchEmbeddings = await generateEmbeddings({
  model: 'llama',
  texts
});

console.log(`Generated ${batchEmbeddings.length} embeddings`);
batchEmbeddings.forEach((emb, i) => {
  console.log(`Text ${i}: ${emb.length} dimensions`);
});
```

#### 4. Health Check

```typescript
// Check before operations
const isHealthy = await healthCheck();

if (isHealthy) {
  console.log('Server is ready');
  // Proceed with operations
} else {
  console.error('Server is not reachable');
  // Show error to user
}
```

#### 5. Custom Socket Path

```typescript
// Use custom socket location
const unlisten = await streamCompletion(
  {
    socketPath: '/custom/path/llama.sock',
    model: 'llama',
    prompt: 'Hello'
  },
  (token) => console.log(token)
);
```

#### 6. Full Response Collection

```typescript
import { streamCompletionFull } from '@/lib/services/llamaCppService';

const fullResponse = await streamCompletionFull(
  {
    model: 'llama',
    prompt: 'Write a haiku about Rust programming',
    temperature: 0.9
  },
  (token) => {
    // Optional: Show tokens as they arrive
    process.stdout.write(token);
  }
);

console.log('\n\nComplete response:', fullResponse);
```

## Event Payloads

### `llama-cpp-stream` Event

```typescript
interface StreamEvent {
  status: 'loading' | 'streaming' | 'done';
  content?: string;      // Token content (when streaming)
  model?: string;        // Model name (when loading)
  done?: boolean;        // Completion flag
}
```

### `llama-cpp-error` Event

```typescript
interface ErrorEvent {
  error: string;  // Error description
}
```

## Error Handling

Common errors and solutions:

1. **Socket not found**
   ```
   Failed to connect to socket '/tmp/llama.sock': No such file or directory
   ```
   → Start llama-server with `--unix-socket /tmp/llama.sock`

2. **Connection refused**
   ```
   Failed to connect to socket: Connection refused
   ```
   → Verify llama-server is running: `ps aux | grep llama-server`

3. **Permission denied**
   ```
   Failed to connect to socket: Permission denied
   ```
   → Check socket permissions: `chmod 666 /tmp/llama.sock`

4. **Model not loaded**
   ```
   Server error 503: Model not loaded
   ```
   → Wait for model to finish loading or check llama-server logs

## Configuration

### Change Default Socket Path

Edit `src-tauri/src/llama_cpp.rs`:

```rust
const DEFAULT_SOCKET_PATH: &str = "/your/custom/path.sock";
```

### Adjust Streaming Behavior

Currently streams each token immediately. To batch tokens (like ollama_rs), modify the `llama_cpp_completion_stream` function to accumulate tokens before emitting.

## Integration with Existing Services

### Use alongside Ollama

```typescript
import { generateCompletionStream as ollamaStream } from '@/lib/services/ollamaService';
import { streamCompletion as llamaCppStream } from '@/lib/services/llamaCppService';

async function generateWithFallback(prompt: string) {
  try {
    // Try llama-server first
    return await llamaCppStream({
      model: 'llama',
      prompt
    }, (token) => console.log(token));
  } catch (error) {
    console.log('Falling back to Ollama...');
    // Fallback to Ollama
    return await ollamaStream({
      model: 'llama2',
      prompt
    });
  }
}
```

## Performance Notes

- **Unix sockets** are faster than HTTP for local IPC
- **Persistent connection** via `OnceCell` reduces overhead
- **Immediate streaming** provides better UX than batching
- **No HTTP overhead** - direct socket communication

## Troubleshooting

### Debug Socket Connection

```bash
# Check if socket exists
ls -la /tmp/llama.sock

# Test with curl (if llama-server supports HTTP over Unix socket)
curl --unix-socket /tmp/llama.sock http://localhost/health

# Monitor llama-server logs
tail -f /path/to/llama-server.log
```

### Enable Debug Logging

Add to Rust code:

```rust
eprintln!("Connecting to socket: {}", socket_path);
eprintln!("Request body: {}", body_json);
```

## License

Same as parent project.
