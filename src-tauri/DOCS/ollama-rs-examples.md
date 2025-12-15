# Ollama-rs Frontend Integration Examples

Complete frontend examples for using the `ollama-rs` Tauri commands with streaming completion and embeddings.

## Table of Contents

- [Streaming Completion](#streaming-completion)
- [Batch Embeddings](#batch-embeddings)
- [Advanced Patterns](#advanced-patterns)
- [Error Handling](#error-handling)

---

## Streaming Completion

### Basic Usage

Generate text with streaming events:

```typescript
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

async function generateCompletion() {
  let fullResponse = '';
  let unlisten: UnlistenFn;

  // Listen for streaming events
  unlisten = await listen('ollama-rs-stream', (event: any) => {
    const payload = event.payload;
    
    if (payload.status === 'loading') {
      console.log('Loading model:', payload.model);
    } else if (payload.status === 'streaming') {
      fullResponse += payload.tokens;
      console.log('Chunk:', payload.tokens);
      
      if (payload.done) {
        console.log('Streaming complete!');
        console.log('Full response:', fullResponse);
        unlisten(); // Stop listening
      }
    }
  });

  try {
    const context = await invoke<number[]>('generate_completion_stream', {
      model: 'llama3.2',
      prompt: 'Write a haiku about programming',
      system: 'You are a creative AI assistant',
      batch_size: 5 // use snake_case keys to match Rust signature
    });
    
    console.log('Returned context:', context);
  } catch (error) {
    console.error('Error:', error);
    unlisten();
  }
}
```

### With Context (Multi-turn)

Continue a conversation using context from previous generations:

```typescript
let conversationContext: number[] | undefined;

async function continuseConversation() {
  const userMessage = 'Tell me more about that';
  
  let response = '';
  const unlisten = await listen('ollama-rs-stream', (event: any) => {
    if (event.payload.status === 'streaming') {
      response += event.payload.tokens;
      
      if (event.payload.done) {
        // Save context for next turn
        conversationContext = event.payload.context;
        unlisten();
      }
    }
  });

  try {
    await invoke('generate_completion_stream', {
      model: 'llama3.2',
      prompt: userMessage,
      context: conversationContext, // Use previous context
      system: 'You are a helpful assistant'
    });
  } catch (error) {
    console.error(error);
    unlisten();
  }
}
```

### Svelte Component

Complete Svelte component for streaming chat:

```svelte
<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { listen, type UnlistenFn } from '@tauri-apps/api/event';

  let userInput = $state('');
  let messages: { role: 'user' | 'assistant'; content: string }[] = $state([]);
  let isLoading = $state(false);
  let context: number[] | undefined = $state();
  let unlisten: UnlistenFn | null = null;

  const models = ['llama3.2', 'mistral', 'neural-chat', 'phi3'];
  let selectedModel = $state('llama3.2');

  async function sendMessage() {
    if (!userInput.trim()) return;

    isLoading = true;
    messages = [...messages, { role: 'user', content: userInput }];
    
    const prompt = userInput;
    userInput = '';
    
    let assistantMessage = '';

    // Listen for stream events
    unlisten = await listen('ollama-rs-stream', (event: any) => {
      if (event.payload.status === 'loading') {
        console.log('Loading model...');
      } else if (event.payload.status === 'streaming') {
        assistantMessage += event.payload.tokens;
        messages = [
          ...messages.slice(0, -1),
          { role: 'assistant', content: assistantMessage }
        ];

        if (event.payload.done) {
          context = event.payload.context;
          isLoading = false;
          unlisten?.();
        }
      }
    });

    try {
      await invoke('generate_completion_stream', {
        model: selectedModel,
        prompt,
        context,
        system: 'You are a helpful AI assistant. Be concise and clear.',
        batchSize: 8
      });
    } catch (error) {
      console.error('Generation error:', error);
      messages = [...messages, { role: 'assistant', content: `Error: ${error}` }];
      isLoading = false;
      unlisten?.();
    }
  }

  function clearChat() {
    messages = [];
    context = undefined;
  }
</script>

<div class="chat-container">
  <div class="header">
    <h1>Ollama Chat</h1>
    <select bind:value={selectedModel} disabled={isLoading}>
      {#each models as model}
        <option value={model}>{model}</option>
      {/each}
    </select>
  </div>

  <div class="messages">
    {#each messages as msg}
      <div class="message {msg.role}">
        <div class="role">{msg.role}</div>
        <div class="content">{msg.content}</div>
      </div>
    {/each}
  </div>

  <div class="input-area">
    <textarea
      bind:value={userInput}
      placeholder="Type your message..."
      disabled={isLoading}
      onkeydown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
    />
    <div class="buttons">
      <button onclick={sendMessage} disabled={isLoading}>
        {isLoading ? 'Generating...' : 'Send'}
      </button>
      <button onclick={clearChat} disabled={isLoading}>Clear</button>
    </div>
  </div>
</div>

<style>
  .chat-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: #f5f5f5;
  }

  .header {
    padding: 1rem;
    background: #fff;
    border-bottom: 1px solid #ddd;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .header h1 {
    margin: 0;
    font-size: 1.5rem;
  }

  .header select {
    padding: 0.5rem;
    border-radius: 4px;
    border: 1px solid #ddd;
  }

  .messages {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .message {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .message.user {
    align-items: flex-end;
  }

  .message.assistant {
    align-items: flex-start;
  }

  .role {
    font-size: 0.75rem;
    text-transform: uppercase;
    color: #666;
    font-weight: bold;
  }

  .content {
    padding: 0.75rem 1rem;
    border-radius: 8px;
    max-width: 80%;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .message.user .content {
    background: #007bff;
    color: white;
  }

  .message.assistant .content {
    background: white;
    border: 1px solid #ddd;
  }

  .input-area {
    padding: 1rem;
    background: white;
    border-top: 1px solid #ddd;
  }

  textarea {
    width: 100%;
    min-height: 80px;
    padding: 0.75rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-family: inherit;
    resize: vertical;
  }

  .buttons {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  button {
    flex: 1;
    padding: 0.75rem;
    border: none;
    border-radius: 4px;
    background: #007bff;
    color: white;
    cursor: pointer;
    font-weight: bold;
  }

  button:hover:not(:disabled) {
    background: #0056b3;
  }

  button:disabled {
    background: #ccc;
    cursor: not-allowed;
  }
</style>
```

---

## Batch Embeddings

### Basic Usage

Generate embeddings for multiple texts:

```typescript
import { invoke } from '@tauri-apps/api/core';

async function generateEmbeddings() {
  const texts = [
    'Rust is a systems programming language',
    'TypeScript is a typed JavaScript superset',
    'Python excels at data science',
    'Go is great for concurrent applications'
  ];

  try {
    const embeddings = await invoke<number[][]>('generate_embeddings_batch', {
      texts,
      model: 'nomic-embed-text'
    });

    console.log(`Generated ${embeddings.length} embeddings`);
    console.log(`Embedding dimension: ${embeddings[0].length}`);
    
    return embeddings;
  } catch (error) {
    console.error('Embedding error:', error);
  }
}
```

### Similarity Search

Find similar texts using embeddings:

```typescript
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    magnitudeA += a[i] * a[i];
    magnitudeB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
}

async function findSimilarTexts(queryText: string, documents: string[]) {
  const embeddings = await invoke<number[][]>('generate_embeddings_batch', {
    texts: [queryText, ...documents],
    model: 'nomic-embed-text'
  });

  const queryEmbedding = embeddings[0];
  const similarities = embeddings.slice(1).map((emb, idx) => ({
    text: documents[idx],
    similarity: cosineSimilarity(queryEmbedding, emb)
  }));

  // Sort by similarity (descending)
  similarities.sort((a, b) => b.similarity - a.similarity);
  
  return similarities;
}

// Usage
const documents = [
  'Dogs are loyal pets',
  'Cats enjoy independence',
  'Programming is fun',
  'I have a dog at home'
];

findSimilarTexts('pets and animals', documents).then(results => {
  console.log('Similar documents:');
  results.forEach(({ text, similarity }) => {
    console.log(`${similarity.toFixed(3)}: ${text}`);
  });
});
```

### Svelte Component

Real-time embedding visualization:

```svelte
<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';

  let textInputs = $state(['', '', '', '']);
  let embeddings: number[][] = $state([]);
  let loading = $state(false);
  let model = $state('nomic-embed-text');

  async function generateEmbeddings() {
    loading = true;
    try {
      const texts = textInputs.filter(t => t.trim());
      if (texts.length === 0) {
        alert('Enter at least one text');
        return;
      }

      embeddings = await invoke('generate_embeddings_batch', {
        texts,
        model
      });
    } catch (error) {
      console.error(error);
      alert(`Error: ${error}`);
    } finally {
      loading = false;
    }
  }

  function downloadEmbeddings() {
    const data = {
      texts: textInputs.filter(t => t.trim()),
      embeddings,
      model,
      timestamp: new Date().toISOString()
    };

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `embeddings-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
</script>

<div class="container">
  <h1>Text Embeddings Generator</h1>

  <div class="config">
    <select bind:value={model} disabled={loading}>
      <option value="nomic-embed-text">Nomic Embed Text</option>
      <option value="all-minilm">All MiniLM</option>
      <option value="mxbai-embed-large">MXBAI Embed Large</option>
    </select>
  </div>

  <div class="inputs">
    {#each textInputs as text, i}
      <textarea
        bind:value={textInputs[i]}
        placeholder="Text {i + 1}..."
        disabled={loading}
      />
    {/each}
  </div>

  <div class="buttons">
    <button onclick={generateEmbeddings} disabled={loading}>
      {loading ? 'Generating...' : 'Generate Embeddings'}
    </button>
    {#if embeddings.length > 0}
      <button onclick={downloadEmbeddings} disabled={loading}>
        Download JSON
      </button>
    {/if}
  </div>

  {#if embeddings.length > 0}
    <div class="results">
      <h2>Results</h2>
      <p>Generated {embeddings.length} embeddings</p>
      <p>Dimension: {embeddings[0].length}</p>

      <div class="embeddings-list">
        {#each embeddings as emb, i}
          <div class="embedding">
            <h3>Text {i + 1}</h3>
            <p class="preview">{textInputs[i].substring(0, 50)}...</p>
            <details>
              <summary>View embedding vector</summary>
              <code>{JSON.stringify(emb.slice(0, 10), null, 2)}...</code>
            </details>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .container {
    max-width: 1000px;
    margin: 0 auto;
    padding: 2rem;
  }

  h1 {
    color: #333;
  }

  .config {
    margin: 1rem 0;
  }

  select {
    padding: 0.5rem;
    border-radius: 4px;
    border: 1px solid #ddd;
  }

  .inputs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin: 1rem 0;
  }

  textarea {
    padding: 0.75rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-family: monospace;
    min-height: 100px;
    resize: vertical;
  }

  .buttons {
    display: flex;
    gap: 1rem;
    margin: 1rem 0;
  }

  button {
    flex: 1;
    padding: 0.75rem;
    border: none;
    border-radius: 4px;
    background: #007bff;
    color: white;
    cursor: pointer;
    font-weight: bold;
  }

  button:hover:not(:disabled) {
    background: #0056b3;
  }

  button:disabled {
    background: #ccc;
    cursor: not-allowed;
  }

  .results {
    margin-top: 2rem;
    padding: 1rem;
    background: #f9f9f9;
    border-radius: 4px;
  }

  .embeddings-list {
    display: grid;
    gap: 1rem;
    margin-top: 1rem;
  }

  .embedding {
    padding: 1rem;
    background: white;
    border: 1px solid #ddd;
    border-radius: 4px;
  }

  .embedding h3 {
    margin-top: 0;
  }

  .preview {
    color: #666;
    font-size: 0.9rem;
  }

  details {
    margin-top: 0.5rem;
  }

  summary {
    cursor: pointer;
    color: #007bff;
  }

  code {
    display: block;
    background: #f4f4f4;
    padding: 0.75rem;
    border-radius: 4px;
    overflow-x: auto;
    font-size: 0.85rem;
  }
</style>
```

---

## Advanced Patterns

### Streaming with Progress Tracking

Track token count and generation speed:

```typescript
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

async function generateWithMetrics() {
  let fullResponse = '';
  let tokenCount = 0;
  const startTime = Date.now();

  const unlisten = await listen('ollama-rs-stream', (event: any) => {
    if (event.payload.status === 'streaming') {
      fullResponse += event.payload.tokens;
      tokenCount += event.payload.tokens.length;

      if (event.payload.done) {
        const elapsed = (Date.now() - startTime) / 1000;
        const tokensPerSecond = tokenCount / elapsed;

        console.log('=== Generation Complete ===');
        console.log(`Total tokens: ${tokenCount}`);
        console.log(`Time: ${elapsed.toFixed(2)}s`);
        console.log(`Speed: ${tokensPerSecond.toFixed(2)} tokens/sec`);
        
        unlisten();
      }
    }
  });

  try {
    await invoke('generate_completion_stream', {
      model: 'llama3.2',
      prompt: 'Write a detailed explanation of machine learning',
      batchSize: 10
    });
  } catch (error) {
    console.error(error);
    unlisten();
  }
}
```

### Cancellable Streaming

Abort generation before completion:

```typescript
let currentUnlisten: UnlistenFn | null = null;

async function generateCancellable() {
  let response = '';

  currentUnlisten = await listen('ollama-rs-stream', (event: any) => {
    if (event.payload.status === 'streaming') {
      response += event.payload.tokens;
    }
  });

  try {
    await invoke('generate_completion_stream', {
      model: 'llama3.2',
      prompt: 'Generate a very long essay...'
    });
  } catch (error) {
    console.error(error);
  }
}

function cancelGeneration() {
  if (currentUnlisten) {
    currentUnlisten();
    currentUnlisten = null;
    console.log('Generation cancelled');
  }
}
```

---

## Error Handling

### Graceful Degradation

```typescript
async function safeGenerate() {
  try {
    const unlisten = await listen('ollama-rs-stream', (event: any) => {
      // Handle streaming...
    });

    await invoke('generate_completion_stream', {
      model: 'llama3.2',
      prompt: 'Hello'
    });
  } catch (error) {
    const errorMsg = String(error);

    if (errorMsg.includes('Connection')) {
      console.error('Ollama server not running. Start with: ollama serve');
    } else if (errorMsg.includes('Model')) {
      console.error('Model not found. Pull it with: ollama pull llama3.2');
    } else if (errorMsg.includes('timeout')) {
      console.error('Request timeout. Model may be overloaded.');
    } else {
      console.error('Unknown error:', error);
    }
  }
}
```

### Retry Logic

```typescript
async function generateWithRetry(maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Attempt ${attempt}/${maxRetries}`);
      
      const unlisten = await listen('ollama-rs-stream', (event: any) => {
        // Handle streaming...
      });

      await invoke('generate_completion_stream', {
        model: 'llama3.2',
        prompt: 'Test prompt'
      });

      return; // Success
    } catch (error) {
      if (attempt === maxRetries) {
        throw error; // Give up after max retries
      }
      
      const delay = 1000 * Math.pow(2, attempt - 1); // Exponential backoff
      console.log(`Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

---

## Notes

- **Ollama URL**: All commands default to `http://localhost:11434`. Override with `ollamaUrl` parameter if needed.
- **Model availability**: Ensure models are pulled before use (`ollama pull model-name`)
- **Context format**: Context is returned as `number[]` for reuse in subsequent requests
- **Streaming events**: Emitted via `ollama-rs-stream` event name. Listen before invoking command.
- **Error strings**: All errors are returned as strings with descriptive messages

