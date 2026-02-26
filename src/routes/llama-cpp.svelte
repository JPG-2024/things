<script lang="ts">
import { onMount } from "svelte"
import { generateEmbeddings, healthCheck, streamCompletion } from "@/lib/services/llamaCppService"

let prompt = $state("Explain Rust ownership in simple terms")
let systemPrompt = $state("You are a helpful programming tutor")
let model = $state("llama")
let socketPath = $state("/tmp/llama.sock")
let temperature = $state(0.7)
let maxTokens = $state(512)

let response = $state("")
let isStreaming = $state(false)
let error = $state("")
let isHealthy = $state(false)
let embeddings = $state<number[][]>([])

let unlistenFn: (() => void) | null = null

onMount(async () => {
	// Check health on mount
	await checkHealth()
})

async function checkHealth() {
	try {
		isHealthy = await healthCheck(socketPath)
		error = isHealthy ? "" : "Server is not reachable"
	} catch (e) {
		error = String(e)
		isHealthy = false
	}
}

async function handleStreamCompletion() {
	if (isStreaming) return

	response = ""
	error = ""
	isStreaming = true

	try {
		unlistenFn = await streamCompletion(
			{
				socketPath,
				model,
				prompt,
				system: systemPrompt || undefined,
				temperature,
				maxTokens,
			},
			(token) => {
				response += token
			},
			(err) => {
				error = err
				isStreaming = false
			},
		)
	} catch (e) {
		error = String(e)
		isStreaming = false
	}

	// Auto-cleanup after completion
	setTimeout(() => {
		isStreaming = false
	}, 1000)
}

async function handleGenerateEmbeddings() {
	const texts = [
		"Hello world",
		"Rust is a systems programming language",
		"Machine learning with neural networks",
	]

	error = ""

	try {
		embeddings = await generateEmbeddings({
			socketPath,
			model,
			texts,
		})
	} catch (e) {
		error = String(e)
	}
}

function stopStreaming() {
	unlistenFn?.()
	unlistenFn = null
	isStreaming = false
}
</script>

<div class="container">
  <h1>LlamaCpp Unix Socket Demo</h1>

  <!-- Health Check -->
  <div class="health-check">
    <button onclick={checkHealth}>Check Server Health</button>
    <span class={isHealthy ? 'status-ok' : 'status-error'}>
      {isHealthy ? '✓ Server is healthy' : '✗ Server unreachable'}
    </span>
  </div>

  <!-- Configuration -->
  <div class="config">
    <h2>Configuration</h2>
    <div class="form-group">
      <label>Socket Path:</label>
      <input type="text" bind:value={socketPath} placeholder="/tmp/llama.sock" />
    </div>
    <div class="form-group">
      <label>Model:</label>
      <input type="text" bind:value={model} placeholder="llama" />
    </div>
    <div class="form-group">
      <label>Temperature:</label>
      <input type="number" bind:value={temperature} min="0" max="2" step="0.1" />
    </div>
    <div class="form-group">
      <label>Max Tokens:</label>
      <input type="number" bind:value={maxTokens} min="1" max="4096" />
    </div>
  </div>

  <!-- Streaming Completion -->
  <div class="completion-section">
    <h2>Streaming Completion</h2>

    <div class="form-group">
      <label>System Prompt:</label>
      <textarea bind:value={systemPrompt} rows="2" placeholder="Optional system prompt"></textarea>
    </div>

    <div class="form-group">
      <label>Prompt:</label>
      <textarea bind:value={prompt} rows="3" placeholder="Enter your prompt"></textarea>
    </div>

    <div class="actions">
      <button onclick={handleStreamCompletion} disabled={isStreaming || !isHealthy}>
        {isStreaming ? 'Streaming...' : 'Generate'}
      </button>

      {#if isStreaming}
        <button onclick={stopStreaming} class="stop-btn">Stop</button>
      {/if}
    </div>

    {#if response}
      <div class="response">
        <h3>Response:</h3>
        <pre>{response}</pre>
      </div>
    {/if}
  </div>

  <!-- Embeddings -->
  <div class="embeddings-section">
    <h2>Embeddings</h2>

    <button onclick={handleGenerateEmbeddings} disabled={!isHealthy}>
      Generate Sample Embeddings
    </button>

    {#if embeddings.length > 0}
      <div class="embeddings-result">
        <h3>Results:</h3>
        {#each embeddings as embedding, i}
          <div class="embedding-item">
            <strong>Text {i + 1}:</strong>
            {embedding.length} dimensions
            <details>
              <summary>Show vector</summary>
              <pre>{embedding
                  .slice(0, 10)
                  .map((v) => v.toFixed(4))
                  .join(', ')}... (truncated)</pre>
            </details>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Error Display -->
  {#if error}
    <div class="error">
      <strong>Error:</strong>
      <p>{error}</p>
    </div>
  {/if}
</div>

<style>
  .container {
    max-width: 800px;
    margin: 2rem auto;
    padding: 2rem;
    font-family:
      system-ui,
      -apple-system,
      sans-serif;
  }

  h1 {
    color: #333;
    border-bottom: 2px solid #007bff;
    padding-bottom: 0.5rem;
  }

  h2 {
    color: #555;
    margin-top: 2rem;
    font-size: 1.25rem;
  }

  h3 {
    color: #666;
    font-size: 1rem;
    margin-bottom: 0.5rem;
  }

  .health-check {
    display: flex;
    gap: 1rem;
    align-items: center;
    padding: 1rem;
    background: #f5f5f5;
    border-radius: 4px;
    margin-bottom: 1rem;
  }

  .status-ok {
    color: #28a745;
    font-weight: bold;
  }

  .status-error {
    color: #dc3545;
    font-weight: bold;
  }

  .config,
  .completion-section,
  .embeddings-section {
    margin-bottom: 2rem;
  }

  .form-group {
    margin-bottom: 1rem;
  }

  label {
    display: block;
    font-weight: bold;
    margin-bottom: 0.25rem;
    color: #555;
  }

  input,
  textarea {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-family: inherit;
    font-size: 0.95rem;
  }

  input[type='number'] {
    width: 150px;
  }

  textarea {
    resize: vertical;
    font-family: monospace;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  button {
    padding: 0.5rem 1rem;
    background: #007bff;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.95rem;
    font-weight: 500;
    transition: background 0.2s;
  }

  button:hover:not(:disabled) {
    background: #0056b3;
  }

  button:disabled {
    background: #ccc;
    cursor: not-allowed;
  }

  .stop-btn {
    background: #dc3545;
  }

  .stop-btn:hover {
    background: #c82333;
  }

  .response,
  .embeddings-result {
    margin-top: 1rem;
    padding: 1rem;
    background: #f8f9fa;
    border-radius: 4px;
    border: 1px solid #dee2e6;
  }

  pre {
    margin: 0;
    padding: 1rem;
    background: white;
    border-radius: 4px;
    overflow-x: auto;
    font-size: 0.9rem;
    line-height: 1.5;
    white-space: pre-wrap;
    word-wrap: break-word;
  }

  .embedding-item {
    padding: 0.75rem;
    background: white;
    border-radius: 4px;
    margin-bottom: 0.5rem;
    border: 1px solid #e0e0e0;
  }

  details {
    margin-top: 0.5rem;
  }

  summary {
    cursor: pointer;
    color: #007bff;
    font-size: 0.9rem;
  }

  summary:hover {
    text-decoration: underline;
  }

  .error {
    padding: 1rem;
    background: #f8d7da;
    border: 1px solid #f5c6cb;
    border-radius: 4px;
    color: #721c24;
    margin-top: 1rem;
  }

  .error strong {
    display: block;
    margin-bottom: 0.5rem;
  }

  .error p {
    margin: 0;
    font-family: monospace;
    font-size: 0.9rem;
  }
</style>
