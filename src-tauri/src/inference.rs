use open_agent::{query, AgentOptions, Provider, get_base_url, ContentBlock, Message, MessageRole};
use futures::StreamExt;
use tauri::{AppHandle, Emitter};
use serde_json::json;
use serde::Deserialize;

#[derive(Deserialize)]
pub struct InferenceOptions {
    pub model: Option<String>,
    pub base_url: Option<String>,
    pub system_prompt: Option<String>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
}

#[derive(Deserialize, Clone)]
pub struct ChatMessage {
    pub role: MessageRole,
    pub content: String,
}

#[tauri::command]
pub async fn generate_response(
    app: AppHandle,
    prompt: String,
    options: Option<InferenceOptions>,
    stream: bool,
) -> Result<String, String> {

    app.emit(
        "flow-status",
        json!({"key": "inference", "status": "inference", "data": null}),
    )
    .map_err(|e| format!("Failed to emit flow-status event: {}", e))?;


    // 1. Obtener el base_url actual por defecto
    let default_base_url = get_base_url(Some(Provider::LlamaCpp), None);
    
    let mut builder = AgentOptions::builder();

    if let Some(opts) = options {
        // 2. Usar el base_url de opciones si existe, sino usar el default_base_url calculado arriba
        builder = builder
            .base_url(opts.base_url.unwrap_or(default_base_url))
            .model(opts.model.as_deref().unwrap_or("llamacpp-default"));

        if let Some(system) = opts.system_prompt {
            builder = builder.system_prompt(system);
        }
        if let Some(temp) = opts.temperature {
            builder = builder.temperature(temp);
        }
        if let Some(tokens) = opts.max_tokens {
            builder = builder.max_tokens(tokens);
        }
    } else {
        // 3. Si no hay opciones, usar todo por defecto
        builder = builder
            .base_url(default_base_url)
            .model("llamacpp-default");
    }

    let options = builder
        .build()
        .map_err(|e| e.to_string())?;

    let mut content_stream = query(&prompt, &options)
        .await
        .map_err(|e| e.to_string())?;

    let mut full_response = String::new();
    let mut started_emitting = false;

    while let Some(result) = content_stream.next().await {
        match result {
            Ok(block) => { 
                match block {
                    ContentBlock::Text(text_block) => {
                        println!("Text content → '{}'", text_block.text);
                        
                        full_response.push_str(&text_block.text);

                        // Only emit if token is non-empty or we've already started
                        if !text_block.text.is_empty() || started_emitting {
                            started_emitting = true;
                            if stream {
                                app.emit(
                                    "inference-token",
                                    json!({"token": text_block.text}),
                                )
                                .map_err(|e| format!("Failed to emit inference-token event: {}", e))?;
                            }
                        }
                    }
                    ContentBlock::ToolUse(tool_block) => {
                        println!("Tool called: {}", tool_block.id);
                    }
                    ContentBlock::ToolResult(_) => {
                        // Tool results handled internally
                    }
                }
            }
            Err(e) => {
                let error_msg = e.to_string();
                if error_msg.contains("No data in SSE chunk") {
                    eprintln!("Warning: skipping empty SSE chunk");
                } else {
                    eprintln!("Inference stream error: {:?}", e);
                    return Err(format!("Streaming error: {}", e));
                }
            }
        }
    }

    app.emit(
        "flow-status",
        json!({"key": "inference", "status": "done", "data": null}),
    )
    .map_err(|e| format!("Failed to emit flow-status event: {}", e))?;

    Ok(full_response)
}

#[tauri::command]
pub async fn generate_chat_response(
    app: AppHandle,
    messages: Vec<ChatMessage>,
    options: Option<InferenceOptions>,
    stream: bool,
) -> Result<String, String> {
    if messages.is_empty() {
        return Err("Messages cannot be empty".to_string());
    }

    let default_base_url = get_base_url(Some(Provider::LlamaCpp), None);
    
    let mut builder = AgentOptions::builder();

    if let Some(opts) = options {
        builder = builder
            .base_url(opts.base_url.unwrap_or(default_base_url))
            .model(opts.model.as_deref().unwrap_or("llamacpp-default"));

        if let Some(system) = opts.system_prompt {
            builder = builder.system_prompt(system);
        }
        if let Some(temp) = opts.temperature {
            builder = builder.temperature(temp);
        }
        if let Some(tokens) = opts.max_tokens {
            builder = builder.max_tokens(tokens);
        }
    } else {
        builder = builder
            .base_url(default_base_url)
            .model("llamacpp-default");
    }

    let agent_options = builder.build().map_err(|e| e.to_string())?;

    // Format chat messages as a prompt string
    let prompt = messages
        .iter()
        .map(|msg| {
            let role_str = match msg.role {
                MessageRole::User => "User",
                MessageRole::Assistant => "Assistant",
                _ => "System",
            };
            format!("{}: {}", role_str, msg.content)
        })
        .collect::<Vec<_>>()
        .join("\n");

    let mut content_stream = query(&prompt, &agent_options)
        .await
        .map_err(|e| e.to_string())?;

    let mut full_response = String::new();
    let mut started_emitting = false;

    while let Some(result) = content_stream.next().await {
        match result {
            Ok(block) => {
                println!("Raw content block: {:?}", block);
                match block {
                    ContentBlock::Text(text_block) => {
                        println!("Text content → '{}'", text_block.text);
                        
                        full_response.push_str(&text_block.text);

                        // Only emit if token is non-empty or we've already started
                        if !text_block.text.is_empty() || started_emitting {
                            started_emitting = true;
                            if stream {
                                app.emit(
                                    "chat-token",
                                    json!({"token": text_block.text}),
                                )
                                .map_err(|e| format!("Failed to emit chat-token event: {}", e))?;
                            }
                        }
                    }
                    ContentBlock::ToolUse(tool_block) => {
                        println!("Tool called: {}", tool_block.id);
                    }
                    ContentBlock::ToolResult(_) => {
                        // Tool results handled internally
                    }
                }
            }
            Err(e) => {
                let error_msg = e.to_string();
                if error_msg.contains("No data in SSE chunk") {
                    eprintln!("Warning: skipping empty SSE chunk");
                } else {
                    eprintln!("Chat stream error: {:?}", e);
                    return Err(format!("Streaming error: {}", e));
                }
            }
        }
    }

    Ok(full_response)
}
