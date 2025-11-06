use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

#[derive(Debug, Serialize, Deserialize)]
struct MessageInput {
    role: String,
    content: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct CompletionArgs {
    temperature: f32,
    max_tokens: u32,
    top_p: f32,
}

#[derive(Debug, Serialize, Deserialize)]
struct RequestPayload {
    model: String,
    inputs: Vec<MessageInput>,
    tools: Vec<Value>,
    completion_args: CompletionArgs,
    stream: bool,
    instructions: String,
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
    model: Option<String>,
) -> Result<(), String> {
    dotenv::dotenv().ok();

    println!("✅ Starting inference");

    app.emit(
        "flow-status",
        json!({"key": "inference", "status": "Processing inference", "data": null}),
    );

    let api_key = std::env::var("MISTRAL_API_KEY")
        .map_err(|_| "MISTRAL_API_KEY not found in environment".to_string())?;

    let mut inputs = Vec::new();

    // Add system prompt if provided
    if let Some(sys_prompt) = system_prompt {
        inputs.push(MessageInput {
            role: "system".to_string(),
            content: sys_prompt,
        });
    }

    // Add user message
    inputs.push(MessageInput {
        role: "user".to_string(),
        content: prompt,
    });

    let payload = RequestPayload {
        model: model.unwrap_or_else(|| "ministral-3b-latest".to_string()),
        inputs,
        tools: vec![],
        completion_args: CompletionArgs {
            temperature: 0.7,
            max_tokens: 2048,
            top_p: 1.0,
        },
        stream: true,
        instructions: String::new(),
    };

    let client = Client::new();
    let response = client
        .post("https://api.mistral.ai/v1/conversations")
        .header("Content-Type", "application/json")
        .header("X-API-KEY", &api_key)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let headers = format!("{:?}", response.headers());
        let error_body = response.text().await.unwrap_or_else(
            |_| "Unable to read error body".to_string(),
        );

        let error_msg = format!(
            "API error [{}]\nHeaders: {}\nBody: {}",
            status, headers, error_body
        );

        return Err(error_msg);
    }



    let mut stream = response.bytes_stream();
    let mut buffer = String::new();

    use futures::StreamExt;

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| format!("Stream error: {}", e))?;

        let chunk_str = String::from_utf8_lossy(&chunk);
        buffer.push_str(&chunk_str);

        println!("Processing chunk: {}", chunk_str);

        // Process complete lines
        while let Some(line_end) = buffer.find('\n') {
            let line = buffer[..line_end].trim().to_string();
            buffer = buffer[line_end + 1..].to_string();

            println!("Processing line: {}", line);

            if let Some(data) = line.strip_prefix("data: ") {
                if data == "[DONE]" {
                    app.emit("inference-complete", ())
                        .map_err(|e| format!("Failed to emit completion event: {}", e))?;
                    return Ok(());
                }

                // Try to parse the JSON
                if let Ok(data_obj) = serde_json::from_str::<Value>(data) {
                    if let Some(content) = data_obj["content"].as_str() {
                        let chunk_data = StreamChunk {
                            content: content.to_string(),
                        };

                        println!("{}", content);

                        app.emit("inference-stream", chunk_data)
                            .map_err(|e| format!("Failed to emit stream event: {}", e))?;
                    }
                }
            }
        }
    }

    println!("✅ Inference complete");

    app.emit("inference-complete", ())
        .map_err(|e| format!("Failed to emit completion event: {}", e))?;

    app.emit(
        "flow-status",
        json!({"key": "inference", "status": "done", "data": null}),
    );

    Ok(())
}
