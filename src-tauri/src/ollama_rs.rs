use ollama_rs::{
    generation::completion::{
        request::GenerationRequest, GenerationContext, GenerationResponseStream,
    },
    generation::embeddings::request::GenerateEmbeddingsRequest,
    Ollama,
};
use serde_json::json;
use tauri::{AppHandle, Emitter};
use tokio_stream::StreamExt;

/// Generate completion with streaming
#[tauri::command]
pub async fn generate_completion_stream(
    app: AppHandle,
    model: String,
    prompt: String,
    system: Option<String>,
    context: Option<Vec<i32>>,
    ollama_url: Option<String>,
    batch_size: Option<usize>,
) -> Result<Vec<i32>, String> {
    let batch_size = batch_size.unwrap_or(5);
    let url = ollama_url.unwrap_or_else(|| "http://localhost:11434".to_string());

    // Create Ollama client
    let ollama = Ollama::new(url, 11434);

    // Build generation request
    let mut request = GenerationRequest::new(model.clone(), prompt.clone());

    if let Some(sys) = system {
        request = request.system(sys);
    }

    if let Some(ctx) = context {
        request = request.context(GenerationContext(ctx));
    }

    // Emit loading event
    app.emit(
        "ollama-rs-stream",
        json!({
            "status": "loading",
            "model": model,
            "done": false
        }),
    )
    .map_err(|e| format!("Failed to emit event: {}", e))?;

    // Start streaming generation
    let mut stream: GenerationResponseStream = ollama
        .generate_stream(request)
        .await
        .map_err(|e| format!("Failed to generate stream: {}", e))?;

    let mut token_batch = String::new();
    let mut token_count = 0;
    let mut final_context: Option<Vec<i32>> = None;

    while let Some(response) = stream.next().await {
        let responses = response.map_err(|e| format!("Stream error: {}", e))?;

        for res in responses {
            // Accumulate tokens
            token_batch.push_str(&res.response);
            token_count += 1;

            // Store context from response
            if let Some(ctx) = res.context {
                final_context = Some(ctx.0);
            }

            // Emit batch when we reach batch_size or when done
            if token_count >= batch_size || res.done {
                app.emit(
                    "ollama-rs-stream",
                    json!({
                        "status": "streaming",
                        "tokens": token_batch,
                        "done": res.done,
                        "context": if res.done { final_context.clone() } else { None }
                    }),
                )
                .map_err(|e| format!("Failed to emit event: {}", e))?;

                token_batch.clear();
                token_count = 0;

                if res.done {
                    break;
                }
            }
        }
    }

    // Return final context for subsequent requests
    Ok(final_context.unwrap_or_default())
}

/// Generate embeddings for multiple texts
#[tauri::command]
pub async fn generate_embeddings_batch(
    texts: Vec<String>,
    model: String,
    ollama_url: Option<String>,
) -> Result<Vec<Vec<f32>>, String> {
    let url = ollama_url.unwrap_or_else(|| "http://localhost:11434".to_string());

    // Create Ollama client
    let ollama = Ollama::new(url, 11434);

    let mut embeddings: Vec<Vec<f32>> = Vec::new();

    // Generate embeddings sequentially
    for text in texts {
        let request = GenerateEmbeddingsRequest::new(model.clone(), text.into());
        
        let response = ollama
            .generate_embeddings(request)
            .await
            .map_err(|e| format!("Failed to generate embeddings: {}", e))?;

        // The response contains a Vec<Vec<f32>>, we take the first one
        if let Some(embedding) = response.embeddings.first() {
            embeddings.push(embedding.clone());
        }
    }

    Ok(embeddings)
}
