use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Emitter};
pub use yt_transcript_rs::YouTubeTranscriptApi;

/// Resultado de búsqueda de video en YouTube
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct VideoSearchResult {
    pub title: String,
    pub url: String,
    pub channel: Option<String>,
    pub duration: Option<String>,
}

/// Busca videos en YouTube y retorna los resultados de la primera página
///
/// # Arguments
/// * `app` - Handle de la aplicación Tauri para emitir eventos
/// * `query` - Término de búsqueda
///
/// # Returns
/// Vector de resultados de búsqueda con título, URL, canal y duración
#[tauri::command]
pub async fn search_youtube(
    app: AppHandle,
    query: String,
) -> Result<Vec<VideoSearchResult>, String> {
    app.emit(
        "flow-status",
        json!({"key": "youtube-search", "status": "searching", "data": null}),
    )
    .map_err(|e| format!("Failed to emit flow-status event: {}", e))?;

    // Obtener página del navegador con anti-detección
    let page = crate::browser::get_ready_page()
        .await
        .map_err(|e| format!("Failed to get browser page: {}", e))?;

    // Construir URL de búsqueda directa (más confiable que interactuar con el input)
    let search_url = format!(
        "https://www.youtube.com/results?search_query={}",
        urlencoding::encode(&query)
    );

    println!("🔍 Buscando en YouTube: {}", query);

    // Navegar a la página de resultados
    page.goto(&search_url)
        .await
        .map_err(|e| format!("Failed to navigate to YouTube: {}", e))?;

    page.wait_for_navigation()
        .await
        .map_err(|e| format!("Failed to wait for navigation: {}", e))?;

    app.emit(
        "flow-status",
        json!({"key": "youtube-search", "status": "waiting for results", "data": null}),
    )
    .map_err(|e| format!("Failed to emit flow-status event: {}", e))?;

    // Esperar a que carguen los resultados dinámicamente
    // Intentamos hasta 10 veces con 500ms de espera entre cada intento
    let mut attempts = 0;
    let max_attempts = 10;

    loop {
        let has_results: bool = page
            .evaluate("document.querySelectorAll('ytd-video-renderer').length > 0")
            .await
            .map_err(|e| format!("Failed to check for results: {}", e))?
            .into_value()
            .unwrap_or(false);

        if has_results {
            break;
        }

        attempts += 1;
        if attempts >= max_attempts {
            return Err("Timeout waiting for YouTube search results".to_string());
        }

        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
    }

    // Pequeña espera adicional para asegurar que todo esté cargado
    tokio::time::sleep(tokio::time::Duration::from_millis(1000)).await;

    app.emit(
        "flow-status",
        json!({"key": "youtube-search", "status": "extracting results", "data": null}),
    )
    .map_err(|e| format!("Failed to emit flow-status event: {}", e))?;

    // Extraer resultados via JavaScript
    let js_extract = r#"
        (() => {
            const results = [];
            const videoRenderers = document.querySelectorAll('ytd-video-renderer');
            
            videoRenderers.forEach(renderer => {
                const titleLink = renderer.querySelector('a#video-title');
                const channelEl = renderer.querySelector('#channel-name a, #channel-name yt-formatted-string');
                const durationEl = renderer.querySelector('ytd-thumbnail-overlay-time-status-renderer span');
                
                if (titleLink) {
                    const href = titleLink.getAttribute('href');
                    const title = titleLink.getAttribute('title') || titleLink.textContent?.trim() || '';
                    const channel = channelEl?.textContent?.trim() || null;
                    const duration = durationEl?.textContent?.trim() || null;
                    
                    if (href && href.includes('/watch?v=')) {
                        results.push({
                            title: title,
                            url: 'https://www.youtube.com' + href.split('&')[0],
                            channel: channel,
                            duration: duration
                        });
                    }
                }
            });
            
            return results;
        })()
    "#;

    let results: Vec<VideoSearchResult> = page
        .evaluate(js_extract)
        .await
        .map_err(|e| format!("Failed to extract results: {}", e))?
        .into_value()
        .map_err(|e| format!("Failed to parse results: {}", e))?;

    println!("✅ Encontrados {} videos", results.len());

    app.emit(
        "flow-status",
        json!({"key": "youtube-search", "status": "done", "data": results.clone()}),
    )
    .map_err(|e| format!("Failed to emit flow-status event: {}", e))?;

    Ok(results)
}

/// Fetches a YouTube video transcript as a single string
///
/// # Arguments
/// * `video_id` - The YouTube video ID (e.g., "dQw4w9WgXcQ")
/// * `languages` - Slice of language codes to try in order (e.g., &["en", "es"])
///
/// # Returns
/// A Result containing the full transcript as a String, or an error
#[tauri::command]
pub async fn get_youtube_transcript(
    id: String,
    languages: Option<Vec<String>>,
) -> Result<String, String> {
    let api = YouTubeTranscriptApi::new(None, None, None).map_err(|e| e.to_string())?;

    let langs = languages.unwrap_or_else(|| vec!["en".to_string(), "es".to_string()]);
    let language_strs: Vec<&str> = langs.iter().map(|s| s.as_str()).collect();

    let transcript = api
        .fetch_transcript(&id, language_strs.as_slice(), false)
        .await
        .map_err(|e| e.to_string())?;

    println!("Fetched YouTube transcript.");
    Ok(transcript.text())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_get_youtube_transcript() {
        // This test uses a real YouTube video that has transcripts
        let result =
            get_youtube_transcript("dQw4w9WgXcQ".to_string(), Some(vec!["en".to_string()])).await;
        assert!(result.is_ok());
        let transcript = result.unwrap();
        assert!(!transcript.is_empty());
    }
}
