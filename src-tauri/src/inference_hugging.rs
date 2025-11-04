use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Serialize, Deserialize)]
struct Message {
    role: String,
    content: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct RequestPayload {
    messages: Vec<Message>,
    model: String,
    stream: bool,
}

#[derive(Debug, Serialize, Clone)]
pub struct StreamChunk {
    pub content: String,
}

#[tauri::command]
pub async fn inference(
    app: AppHandle,
    prompt: String,
    system_prompt: Option<String>,
) -> Result<(), String> {
    dotenv::dotenv().ok();

    println!("🚀 Starting inference");

    let api_key = std::env::var("HUGGING_FACE_API_KEY")
        .map_err(|_| "HUGGING_FACE_API_KEY not found in environment".to_string())?;

    let mut messages = Vec::new();

    // Add system prompt if provided
    if let Some(sys_prompt) = system_prompt {
        messages.push(Message {
            role: "system".to_string(),
            content: sys_prompt,
        });
    }

    // Add user message
    messages.push(Message {
        role: "user".to_string(),
        content: prompt,
    });

    let payload = RequestPayload {
        messages,
        model: "Qwen/Qwen3-4B-Instruct-2507:nscale".to_string(),
        stream: true,
    };

    let client = Client::new();
    let response = client
        .post("https://router.huggingface.co/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("API error: {}", response.status()));
    }

    println!("🚀 inference done");

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();

    use futures::StreamExt;

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| format!("Stream error: {}", e))?;

        let chunk_str = String::from_utf8_lossy(&chunk);
        buffer.push_str(&chunk_str);

        // Process complete lines
        while let Some(line_end) = buffer.find('\n') {
            let line = buffer[..line_end].trim().to_string();
            buffer = buffer[line_end + 1..].to_string();

            if let Some(data) = line.strip_prefix("data: ") {
                if data == "[DONE]" {
                    app.emit("inference-complete", ())
                        .map_err(|e| format!("Failed to emit completion event: {}", e))?;
                    return Ok(());
                }

                // Try to parse the JSON
                if let Ok(data_obj) = serde_json::from_str::<Value>(data) {
                    if let Some(content) = data_obj["choices"][0]["delta"]["content"].as_str() {
                        let chunk_data = StreamChunk {
                            content: content.to_string(),
                        };

                        app.emit("inference-stream", chunk_data)
                            .map_err(|e| format!("Failed to emit stream event: {}", e))?;
                    }
                }
            }
        }
    }

    app.emit("inference-complete", ())
        .map_err(|e| format!("Failed to emit completion event: {}", e))?;

    Ok(())
}
