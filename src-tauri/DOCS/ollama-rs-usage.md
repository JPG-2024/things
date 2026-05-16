# Ollama-rs Tauri Commands Usage

This document explains how to use the new `ollama-rs` Tauri commands from the frontend.

## Prerequisites

- Ollama server running (default: `http://localhost:11434`)
- Model pulled in Ollama (e.g., `ollama pull llama3.2`)
- For embeddings: embedding model pulled (e.g., `ollama pull nomic-embed-text`)

---

## 1. Streaming Completion Generation

Generate text completions with streaming support.

### Command: `generate_completion_stream`

**Parameters:**

- `model` (string): Model name (e.g., "llama3.2")
- `prompt` (string): The prompt text
- `system` (string, optional): System prompt
- `context` (Vec<i32>, optional): Context from previous generation
- `ollama_url` (string, optional): Custom Ollama URL
- `batch_size` (number, optional): Tokens per batch (default: 5)

**Returns:** `Vec<i32>` - Context for next generation

**Events:** Emits `ollama-rs-stream` events with:

```typescript
{
  status: "loading" | "streaming",
  model?: string,        // on loading
  tokens?: string,       // on streaming
  done: boolean,
  context?: number[]     // on done
}
```

### TypeScript Example

> Tip: A TypeScript interface `GenerateCompletionStreamParams` is available in `src/lib/utils/ollama-rs/index.ts` to help type the params.

```typescript
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

async function generateText() {
	let fullResponse = '';
	let context: number[] | undefined;

	// Listen for streaming events
	const unlisten = await listen('ollama-rs-stream', (event) => {
		const payload = event.payload;

		if (payload.status === 'loading') {
			console.log('Loading model:', payload.model);
		} else if (payload.status === 'streaming') {
			fullResponse += payload.tokens;
			console.log('Chunk:', payload.tokens);

			if (payload.done) {
				console.log('Complete response:', fullResponse);
				context = payload.context; // Save for next request
				unlisten(); // Stop listening
			}
		}
	});

	// Start generation
	try {
		const returnedContext = await invoke('generate_completion_stream', {
			model: 'llama3.2',
			prompt: 'Write a short poem about Rust programming',
			system: 'You are a helpful assistant.',
			context: context, // Use previous context if available
			batch_size: 5
		});

		console.log('Final context:', returnedContext);
	} catch (error) {
		console.error('Error:', error);
		unlisten();
	}
}
```

### Svelte Example

```svelte
<script lang="ts">
	import { invoke } from '@tauri-apps/api/core';
	import { listen } from '@tauri-apps/api/event';

	let response = $state('');
	let loading = $state(false);
	let context: number[] | undefined = $state();

	async function generate() {
		loading = true;
		response = '';

		const unlisten = await listen('ollama-rs-stream', (event) => {
			const payload = event.payload;

			if (payload.status === 'streaming') {
				response += payload.tokens;

				if (payload.done) {
					context = payload.context;
					loading = false;
					unlisten();
				}
			}
		});

		try {
			await invoke('generate_completion_stream', {
				model: 'llama3.2',
				prompt: 'Tell me about Rust',
				system: 'You are a Rust expert.',
				context: context,
				batch_size: 8
			});
		} catch (error) {
			console.error(error);
			loading = false;
			unlisten();
		}
	}
</script>

<button onclick={generate} disabled={loading}>
	{loading ? 'Generating...' : 'Generate'}
</button>

<pre>{response}</pre>
```

---

## 2. Batch Embeddings Generation

Generate embeddings for multiple texts.

### Command: `generate_embeddings_batch`

**Parameters:**

- `texts` (string[]): Array of texts to embed
- `model` (string): Embedding model name
- `ollama_url` (string, optional): Custom Ollama URL

**Returns:** `Vec<Vec<f32>>` - Array of embedding vectors

### TypeScript Example

```typescript
import { invoke } from '@tauri-apps/api/core';

async function generateEmbeddings() {
	try {
		const embeddings: number[][] = await invoke('generate_embeddings_batch', {
			texts: [
				'Rust is a systems programming language',
				'TypeScript is a typed superset of JavaScript',
				'Python is great for data science'
			],
			model: 'nomic-embed-text'
		});

		console.log('Generated embeddings:', embeddings);
		console.log('First embedding dimension:', embeddings[0].length);

		// Use embeddings for similarity search, clustering, etc.
		return embeddings;
	} catch (error) {
		console.error('Error generating embeddings:', error);
	}
}
```

### Svelte Example

```svelte
<script lang="ts">
	import { invoke } from '@tauri-apps/api/core';

	let texts = $state(['', '', '']);
	let embeddings: number[][] = $state([]);
	let loading = $state(false);

	async function embed() {
		loading = true;
		try {
			embeddings = await invoke('generate_embeddings_batch', {
				texts: texts.filter((t) => t.trim()),
				model: 'nomic-embed-text'
			});
		} catch (error) {
			console.error(error);
		} finally {
			loading = false;
		}
	}
</script>

<div>
	{#each texts as text, i}
		<input bind:value={texts[i]} placeholder="Text {i + 1}" />
	{/each}

	<button onclick={embed} disabled={loading}>
		{loading ? 'Generating...' : 'Generate Embeddings'}
	</button>

	{#if embeddings.length > 0}
		<p>Generated {embeddings.length} embeddings</p>
		<p>Dimension: {embeddings[0].length}</p>
	{/if}
</div>
```

---

## Configuration

### Custom Ollama URL

Both commands accept an optional `ollama_url` parameter:

```typescript
await invoke('generate_completion_stream', {
	model: 'llama3.2',
	prompt: 'Hello',
	ollamaUrl: 'http://192.168.1.100:11434' // Custom URL
});
```

### Batch Size for Streaming

Control how many tokens are accumulated before emitting an event:

```typescript
await invoke('generate_completion_stream', {
	model: 'llama3.2',
	prompt: 'Tell me a story',
	batchSize: 10 // Emit every 10 tokens (default: 5)
});
```

---

## Error Handling

Both commands return errors as strings. Always wrap calls in try-catch:

```typescript
try {
	await invoke('generate_completion_stream', {
		model: 'nonexistent-model',
		prompt: 'test'
	});
} catch (error) {
	console.error('Ollama error:', error);
	// Error will include details like "Model not found" or "Connection failed"
}
```

---

## Tips

1. **Context management**: Save the returned context from streaming generations to maintain conversation history
2. **Batch size tuning**: Smaller batches = more frequent UI updates, larger batches = better performance
3. **Sequential embeddings**: The batch function processes texts sequentially, so it may take time for large arrays
4. **Model selection**: Use appropriate models:
   - Text generation: `llama3.2`, `mistral`, `phi3`, etc.
   - Embeddings: `nomic-embed-text`, `all-minilm`, etc.

---

## See Also

- [Ollama-rs Documentation](https://docs.rs/ollama-rs/0.3.3/)
- [Ollama API Documentation](https://github.com/ollama/ollama/blob/main/docs/api.md)
- [Tauri Commands Documentation](https://tauri.app/v1/guides/features/command/)
