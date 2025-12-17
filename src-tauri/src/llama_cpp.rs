use hyper::{Body, Client, Method, Request};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Emitter};
use futures_util::stream::StreamExt;
use std::sync::Arc;
use tokio::sync::OnceCell;

// Default llama-server URL
const DEFAULT_SERVER_URL: &str = "http://127.0.0.1:8080";
const DEFAULT_EMBEDDINGS_SERVER_URL: &str = "http://127.0.0.1:8081";

const MODEL_SERVERS: &[(&str, &str)] = &[
    ("default", "http://127.0.0.1:8080"),
    ("embeddings", "http://localhost:8081"),
];

// Global HTTP client instance
pub static HTTP_CLIENT: OnceCell<Arc<Client<hyper::client::HttpConnector>>> = OnceCell::const_new();

/// Initialize the HTTP client
pub async fn init_client() -> Arc<Client<hyper::client::HttpConnector>> {
    HTTP_CLIENT
        .get_or_init(|| async {
            Arc::new(Client::new())
        })
        .await
        .clone()
}

// ============================================================================
// Data Structures
// ============================================================================

#[derive(Serialize)]
struct ChatCompletionRequest {
    model: String,
    messages: Vec<Message>,
    stream: bool,
    
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
    
    #[serde(skip_serializing_if = "Option::is_none")]
    top_p: Option<f32>,
}

#[derive(Serialize, Clone)]
struct Message {
    role: String,
    content: String,
}

#[derive(Deserialize, Debug)]
struct ChatCompletionChunk {
    choices: Vec<Choice>,
}

#[derive(Deserialize, Debug)]
struct Choice {
    delta: Delta,
    finish_reason: Option<String>,
}

#[derive(Deserialize, Debug)]
struct Delta {
    #[serde(default)]
    content: Option<String>,
}

#[derive(Serialize)]
struct EmbeddingsRequest {
    model: String,
    input: Vec<String>,
}

#[derive(Deserialize)]
struct EmbeddingsResponse {
    data: Vec<EmbeddingData>,
}

#[derive(Deserialize)]
struct EmbeddingData {
    embedding: Vec<f32>,
}

// ============================================================================
// Tauri Commands
// ============================================================================

/// Generate completion with streaming over Unix socket
#[tauri::command]
pub async fn llama_cpp_completion_stream(
    app: AppHandle,
    model: String, // Ahora es el identificador del socket
    prompt: String,
    system: Option<String>,
    temperature: Option<f32>,
    max_tokens: Option<u32>,
) -> Result<(), String> {
    let server_url = MODEL_SERVERS
        .iter()
        .find(|(name, _)| *name == model)
        .map(|(_, path)| *path)
        .unwrap_or(DEFAULT_SERVER_URL);
        
    // Emit loading event
    app.emit(
        "llama-cpp-stream",
        json!({
            "status": "loading",
            "model": model.clone(),
        }),
    )
    .map_err(|e| {
        let error_msg = format!("Failed to emit loading event: {}", e);
        let _ = app.emit(
            "llama-cpp-error",
            json!({ "error": error_msg.clone() }),
        );
        error_msg
    })?;
    
    // Build messages
    let mut messages = Vec::new();
    
    if let Some(sys) = system {
        messages.push(Message {
            role: "system".to_string(),
            content: sys,
        });
    }
    
    messages.push(Message {
        role: "user".to_string(),
        content: prompt,
    });
    
    // Create request body
    let request_body = ChatCompletionRequest {
        model: model.clone(),
        messages,
        stream: true,
        temperature,
        max_tokens,
        top_p: None,
    };
    
    let body_json = serde_json::to_string(&request_body).map_err(|e| {
        let error_msg = format!("Failed to serialize request: {}", e);
        let _ = app.emit(
            "llama-cpp-error",
            json!({ "error": error_msg.clone() }),
        );
        error_msg
    })?;
    
    // Get or initialize client
    let client = init_client().await;
    
    // Build HTTP URI
    let uri = format!("{}/v1/chat/completions", server_url)
        .parse::<hyper::Uri>()
        .map_err(|e| format!("Failed to parse URI: {}", e))?;
    
    // Build HTTP request
    let request = Request::builder()
        .method(Method::POST)
        .uri(uri)
        .header("Content-Type", "application/json")
        .body(Body::from(body_json))
        .map_err(|e| {
            let error_msg = format!("Failed to build request: {}", e);
            let _ = app.emit(
                "llama-cpp-error",
                json!({ "error": error_msg.clone() }),
            );
            error_msg
        })?;
    
    // Send request
    let response = client.request(request).await.map_err(|e| {
        let error_msg = format!("Failed to connect to '{}': {}. Make sure llama-server is running.", server_url, e);
        let _ = app.emit(
            "llama-cpp-error",
            json!({ "error": error_msg.clone() }),
        );
        error_msg
    })?;
    
    // Check status
    if !response.status().is_success() {
        let error_msg = format!("Server returned error status: {}", response.status());
        let _ = app.emit(
            "llama-cpp-error",
            json!({ "error": error_msg.clone() }),
        );
        return Err(error_msg);
    }
    
    // Process streaming response
    let mut body = response.into_body();
    let mut buffer = String::new();
    
    while let Some(chunk) = body.next().await {
        let chunk = chunk.map_err(|e| {
            let error_msg = format!("Stream error: {}", e);
            let _ = app.emit(
                "llama-cpp-error",
                json!({ "error": error_msg.clone() }),
            );
            error_msg
        })?;
        
        let chunk_str = String::from_utf8_lossy(&chunk);
        buffer.push_str(&chunk_str);
        
        // Process SSE lines
        while let Some(line_end) = buffer.find('\n') {
            let line = buffer[..line_end].trim().to_string();
            buffer = buffer[line_end + 1..].to_string();
            
            if line.is_empty() || !line.starts_with("data: ") {
                continue;
            }
            
            let data = &line[6..]; // Remove "data: " prefix
            
            if data == "[DONE]" {
                app.emit(
                    "llama-cpp-stream",
                    json!({
                        "status": "done",
                        "done": true,
                    }),
                )
                .map_err(|e| format!("Failed to emit done event: {}", e))?;
                return Ok(());
            }
            
            // Parse JSON chunk
            match serde_json::from_str::<ChatCompletionChunk>(data) {
                Ok(chunk) => {
                    if let Some(choice) = chunk.choices.first() {
                        if let Some(content) = &choice.delta.content {
                            // Emit streaming token immediately (without done flag)
                            app.emit(
                                "llama-cpp-stream",
                                json!({
                                    "status": "streaming",
                                    "content": content,
                                }),
                            )
                            .map_err(|e| format!("Failed to emit stream event: {}", e))?;
                            
                            // If done, emit final event only once
                            if choice.finish_reason.is_some() {
                                app.emit(
                                    "llama-cpp-stream",
                                    json!({
                                        "status": "done",
                                        "done": true,
                                    }),
                                )
                                .map_err(|e| format!("Failed to emit done event: {}", e))?;
                                return Ok(());
                            }
                        }
                    }
                }
                Err(e) => {
                    eprintln!("Failed to parse chunk: {} | Data: {}", e, data);
                }
            }
        }
    }
    
    Ok(())
}

/// Generate embeddings over HTTP
#[tauri::command]
pub async fn llama_cpp_embeddings(
    model: String,
    texts: Vec<String>,
) -> Result<Vec<Vec<f32>>, String> {
    let server_url = MODEL_SERVERS
        .iter()
        .find(|(name, _)| *name == model)
        .map(|(_, path)| *path)
        .unwrap_or(DEFAULT_EMBEDDINGS_SERVER_URL);
    
    // Create request body
    let request_body = EmbeddingsRequest {
        model,
        input: texts,
    };
    
    let body_json = serde_json::to_string(&request_body)
        .map_err(|e| format!("Failed to serialize request: {}", e))?;
    
    // Get or initialize client
    let client = init_client().await;
    
    // Build HTTP URI
    let uri = format!("{}/v1/embeddings", server_url)
        .parse::<hyper::Uri>()
        .map_err(|e| format!("Failed to parse URI: {}", e))?;
    
    // Build HTTP request
    let request = Request::builder()
        .method(Method::POST)
        .uri(uri)
        .header("Content-Type", "application/json")
        .body(Body::from(body_json))
        .map_err(|e| format!("Failed to build request: {}", e))?;
    
    // Send request
    let response = client.request(request).await.map_err(|e| {
        format!(
            "Failed to connect to '{}': {}. Make sure llama-server is running.",
            server_url, e
        )
    })?;
    
    // Check status
    let status = response.status();
    if !status.is_success() {
        let body_bytes = hyper::body::to_bytes(response.into_body())
            .await
            .map_err(|e| format!("Failed to read error response: {}", e))?;
        let error_text = String::from_utf8_lossy(&body_bytes);
        return Err(format!(
            "Server error {}: {}",
            status,
            error_text
        ));
    }
    
    // Parse response
    let body_bytes = hyper::body::to_bytes(response.into_body())
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;
    
    let embeddings_response: EmbeddingsResponse = serde_json::from_slice(&body_bytes)
        .map_err(|e| format!("Failed to parse response: {}", e))?;
    
    // Extract embeddings
    let embeddings: Vec<Vec<f32>> = embeddings_response
        .data
        .into_iter()
        .map(|d| d.embedding)
        .collect();
    
    Ok(embeddings)
}

/// Health check for llama-server
#[tauri::command]
pub async fn llama_cpp_health_check(server_url: Option<String>) -> Result<bool, String> {
    let server_url = server_url.unwrap_or_else(|| DEFAULT_SERVER_URL.to_string());
    let client = init_client().await;
    
    let uri = format!("{}/health", server_url)
        .parse::<hyper::Uri>()
        .map_err(|e| format!("Failed to parse URI: {}", e))?;
    
    match client.get(uri).await {
        Ok(response) => Ok(response.status().is_success()),
        Err(_) => Ok(false),
    }
}