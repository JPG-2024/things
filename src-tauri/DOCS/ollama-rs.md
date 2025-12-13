# Using `ollama.rs` Functions

This document explains how to use the main functions provided in `ollama.rs` for interacting with an Ollama server from your Tauri application. The module provides async Rust functions for generating text (with streaming) and generating embeddings using Ollama models.

## Prerequisites
- Ollama server running and accessible (default: `http://localhost:11434`)
- Model(s) already pulled into Ollama (e.g., `llama2`, `mistral`, etc.)
- Add `ollama.rs` to your Tauri backend and ensure dependencies: `reqwest`, `serde`, `serde_json`, `tauri`

## Configuration
The `OllamaConfig` struct manages the Ollama server URL and timeout. By default, it reads the `OLLAMA_URL` environment variable or falls back to `http://localhost:11434`.

---

## 1. Generate Text with Streaming: `generate_stream`

This function streams generated text from a model in batches, emitting events to the frontend.

**Signature:**
```rust
#[tauri::command]
pub async fn generate_stream(
    app: AppHandle,
    model: String,
    prompt: String,
    ollama_url: Option<String>,
    batch_size: Option<usize>,
) -> Result<(), String>
```

**Parameters:**
- `app`: Tauri `AppHandle` for emitting events
- `model`: Name of the Ollama model (e.g., `llama2`)
- `prompt`: The prompt text to generate from
- `ollama_url`: Optional custom Ollama server URL
- `batch_size`: Optional number of tokens per event batch (default: 5)

**Frontend Event:**
- Emits `ollama-stream` events with status `loading` and `streaming`.

**Example Usage:**
```rust
// In your Tauri command handler
let _ = generate_stream(
    app_handle,
    "llama2".to_string(),
    "Write a poem about Rust.".to_string(),
    None,
    Some(8)
).await;
```

**Frontend Listener Example (JavaScript):**
```js
tauri.event.listen('ollama-stream', (event) => {
  if (event.payload.status === 'loading') {
    // Show loading message
  } else if (event.payload.status === 'streaming') {
    // Append event.payload.tokens to output
    if (event.payload.done) {
      // Generation complete
    }
  }
});
```

---

## 2. Generate Embeddings: `generate_embeddings`

This function generates vector embeddings for a given text using a specified model.

**Signature:**
```rust
#[tauri::command]
pub async fn generate_embeddings(
    model: String,
    text: String,
    ollama_url: Option<String>,
) -> Result<Vec<f32>, String>
```

**Parameters:**
- `model`: Name of the Ollama model (must support embeddings)
- `text`: The input text to embed
- `ollama_url`: Optional custom Ollama server URL

**Returns:**
- `Ok(Vec<f32>)`: The embedding vector
- `Err(String)`: Error message

**Example Usage:**
```rust
let embedding = generate_embeddings(
    "llama2".to_string(),
    "Rust is a systems programming language.".to_string(),
    None
).await?;
println!("Embedding: {:?}", embedding);
```

---

## 3. Model Existence Check (Internal)

The function `check_model_exists` is used internally to verify that the requested model is available in Ollama. If the model does not exist, an error is returned listing available models.

---

## Error Handling
All functions return `Result` types. Handle errors appropriately in your backend and surface them to the frontend as needed.

---

## Summary Table
| Function              | Purpose                        | Emits Events      | Returns         |
|-----------------------|--------------------------------|-------------------|-----------------|
| `generate_stream`     | Generate text with streaming   | Yes (`ollama-stream`) | `Result<(), String>` |
| `generate_embeddings` | Generate text embeddings       | No                | `Result<Vec<f32>, String>` |

---

## See Also
- [Ollama API Documentation](https://github.com/jmorganca/ollama)
- [Tauri Command Documentation](https://tauri.app/v1/guides/features/command/)
