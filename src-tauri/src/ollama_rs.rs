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
    let url = ollama_url.unwrap_or_else(|| "http://localhost".to_string());

    // Create Ollama client - siempre usar puerto 11434
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
    // Track last full response to avoid sending repeated text if responses are cumulative
    let mut prev_response = String::new();

    while let Some(response) = stream.next().await {
        let responses = response.map_err(|e| format!("Stream error: {}", e))?;

        for res in responses {
            // Compute the delta (new text) in case res.response is cumulative
            let res_text = res.response.clone();
            let delta = if res_text.starts_with(&prev_response) {
                &res_text[prev_response.len()..]
            } else {
                &res_text[..]
            };

            // Accumulate only the new part
            if !delta.is_empty() {
                token_batch.push_str(delta);
            }
            prev_response = res_text;
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

/// Generate embeddings for multiple texts as a batch
#[tauri::command]
pub async fn generate_embeddings_batch(
    texts: Vec<String>,
    model: String,
    ollama_url: Option<String>,
) -> Result<Vec<Vec<f32>>, String> {
    let url = ollama_url.unwrap_or_else(|| "http://localhost".to_string());

    // Create Ollama client - siempre usar puerto 11434
    let ollama = Ollama::new(url, 11434);
    

    // Create batch request with all texts
    let request = GenerateEmbeddingsRequest::new(model.to_string(), texts.into());

    let response = ollama
        .generate_embeddings(request)
        .await
        .map_err(|e| {
            eprintln!("Failed to generate embeddings: {}", e);
            format!("Failed to generate embeddings: {}", e)
        })?;

    // Return all embeddings from the batch response
    Ok(response.embeddings)
}
