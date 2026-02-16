use quick_xml::events::Event;
use quick_xml::Reader;
use regex::Regex;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use tauri::{AppHandle, Emitter};
use url::form_urlencoded;
use url::Url;

/// Estructura para deserializar la respuesta de la API timedtext de YouTube
#[derive(Deserialize)]
struct TimedTextResponse {
    events: Vec<TranscriptEvent>,
}

#[derive(Deserialize)]
struct TranscriptEvent {
    #[serde(rename = "segs")]
    segs: Option<Vec<TranscriptSegment>>,
}

#[derive(Deserialize)]
struct TranscriptSegment {
    utf8: String,
}

/// Resultado de búsqueda de video en YouTube
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct VideoSearchResult {
    pub title: String,
    pub url: String,
    pub channel: Option<String>,
    pub duration: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CaptionEntry {
    pub caption: String,
    pub start_time: f64,
    pub end_time: f64,
}

#[derive(Deserialize, Clone, Debug)]
pub struct VideoInfoSelector {
    pub name: String,
    pub selector: String,
}

/// Waits for an element to appear in the DOM using JavaScript evaluation
/// and then extracts all text content recursively from that element
/// This is ideal for SPAs where content loads dynamically
///
/// # Arguments
/// * `page` - The chromiumoxide Page reference
/// * `selector` - CSS selector to wait for
/// * `max_attempts` - Maximum number of polling attempts (default: 50, ~5 seconds with 100ms intervals)
/// * `interval_ms` - Milliseconds between polling attempts (default: 100)
///
/// # Returns
/// Ok(Vec<String>) with all text nodes found, or Err with description if timeout
async fn wait_for_element_spa(
    page: &chromiumoxide::Page,
    selector: &str,
    max_attempts: u32,
    interval_ms: u64,
) -> Result<Vec<String>, String> {
    let selector_escaped = selector.replace('\\', "\\\\").replace('\'', "\\'");
    
    for attempt in 0..max_attempts {
        let exists: bool = page
            .evaluate(format!(
                "document.querySelectorAll('{}').length > 0",
                selector_escaped
            ))
            .await
            .ok()
            .and_then(|v| v.into_value::<bool>().ok())
            .unwrap_or(false);

        println!("Selector '{}' exists: {}", selector, exists);

        if exists {
            // More robust text extraction for SPAs
            let script = format!(
                r#"(() => {{
                    const elements = document.querySelectorAll('{}');
                    const results = [];
                    
                    elements.forEach(el => {{
                        // Try multiple strategies in order of preference
                        let text = '';
                        
                        // 1. innerText (respects CSS visibility, most SPA-friendly)
                        if (el.innerText && el.innerText.trim()) {{
                            text = el.innerText.trim();
                        }}
                        // 2. textContent (faster, gets all text including hidden)
                        else if (el.textContent && el.textContent.trim()) {{
                            text = el.textContent.trim();
                        }}
                        // 3. aria-label or other accessible attributes
                        else if (el.getAttribute('aria-label')) {{
                            text = el.getAttribute('aria-label').trim();
                        }}
                        // 4. value for input elements
                        else if (el.value) {{
                            text = el.value.toString().trim();
                        }}
                        
                        if (text) {{
                            // Split by newlines and filter empty lines for cleaner results
                            const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
                            results.push(...lines);
                        }}
                    }});
                    
                    return results;
                }})()"#,
                selector_escaped
            );

            let values: Vec<String> = page
                .evaluate(script)
                .await
                .map_err(|e| format!("Failed to execute JS script: {}", e))?
                .into_value()
                .map_err(|e| format!("Failed to parse JS result: {}", e))?;

            // If still empty, try one more fallback: get outerHTML for debugging
            if values.is_empty() {
                let debug_script = format!(
                    r#"Array.from(document.querySelectorAll('{}')).map(el => ({{
                        tag: el.tagName,
                        textContent: el.textContent?.substring(0, 100) || '',
                        childCount: el.childNodes.length,
                        innerHTML: el.innerHTML?.substring(0, 200) || ''
                    }}))"#,
                    selector_escaped
                );
                
                let debug: serde_json::Value = page
                    .evaluate(debug_script)
                    .await
                    .ok()
                    .and_then(|v| v.into_value().ok())
                    .unwrap_or_default();
                    
                eprintln!("Debug: Element found but no text extracted. Structure: {}", 
                    serde_json::to_string_pretty(&debug).unwrap_or_default());
            }

            return Ok(values);
        }

        if attempt < max_attempts - 1 {
            tokio::time::sleep(tokio::time::Duration::from_millis(interval_ms)).await;
        }
    }

    Err(format!(
        "Element '{}' not found after {} attempts",
        selector, max_attempts
    ))
}

async fn collect_near_child_texts(
    page: &chromiumoxide::Page,
    selector: &str,
) -> Result<Vec<String>, String> {
    let selector_escaped = selector.replace("\\", "\\\\").replace("'", "\\'");
    let script = format!(
        r#"(() => {{
            const roots = document.querySelectorAll('{selector}');
            const results = [];

            function traverse(node) {{
                const directTextNodes = Array.from(node.childNodes)
                    .filter(child => child.nodeType === Node.TEXT_NODE)
                    .map(child => child.textContent?.trim())
                    .filter(Boolean);

                directTextNodes.forEach(text => results.push(text));

                for (const child of node.children) {{
                    traverse(child);
                }}
            }}

            roots.forEach(root => {{
                traverse(root);
                if (results.length === 0) {{
                    const fallback = root.innerText;
                    if (fallback) results.push(fallback);
                }}
            }});

            return results;
        }})()"#,
        selector = selector_escaped
    );

    let values: Vec<String> = page
        .evaluate(script)
        .await
        .map_err(|e| format!("Failed to execute JS script: {}", e))?
        .into_value()
        .map_err(|e| format!("Failed to parse JS result: {}", e))?;

    Ok(values)
}

/// Extrae información personalizada desde una URL usando selectores CSS
///
/// # Arguments
/// * `app` - Handle de la aplicación Tauri para emitir eventos
/// * `url` - URL de la página a analizar
/// * `selectors` - Lista de objetos { name, selector }
///
/// # Returns
/// Objeto dinámico con la forma { "name": value }
/// - selector inválido => "invalid selector"
/// - selector válido sin texto => null
/// - selector válido con resultados => array de strings
#[tauri::command]
pub async fn get_video_info(
    app: AppHandle,
    url: String,
    selectors: Vec<VideoInfoSelector>,
) -> Result<HashMap<String, Value>, String> {
    app.emit(
        "flow-status",
        json!({"key": "video-info", "status": "Extracting video info", "data": null}),
    )
    .map_err(|e| format!("Failed to emit flow-status event: {}", e))?;

    let page = crate::browser::get_ready_page()
        .await
        .map_err(|e| format!("Failed to get browser page: {}", e))?;

    page.goto(&url)
        .await
        .map_err(|e| format!("Failed to navigate to page: {}", e))?;

    page.wait_for_navigation()
        .await
        .map_err(|e| format!("Failed to wait for navigation: {}", e))?;

    let mut result: HashMap<String, Value> = HashMap::new();

    for item in selectors {
        let name = item.name.clone();
        let selector = item.selector.clone();
        println!("🔍 Extracting '{}' with selector '{}'", &name, &selector);

        match wait_for_element_spa(&page, &selector, 50, 100).await {
            Ok(texts) => {
                println!("✅ Selector '{}' found, {} texts extracted", &selector, texts.len());
                
                let values: Vec<Value> = texts.into_iter().map(Value::String).collect();
                
                if values.is_empty() {
                    result.insert(name.clone(), Value::Null);
                } else {
                    result.insert(name.clone(), Value::Array(values));
                }
            }
            Err(_) => {
                result.insert(name.clone(), Value::String("invalid selector".to_string()));
            }
        }
    }

    app.emit(
        "flow-status",
        json!({"key": "video-info", "status": "done", "data": result.clone()}),
    )
    .map_err(|e| format!("Failed to emit flow-status event: {}", e))?;

    Ok(result)
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





fn strip_fmt_param(base_url: &str) -> String {
    if let Ok(mut url) = Url::parse(base_url) {
        let pairs: Vec<(String, String)> = url
            .query_pairs()
            .map(|(k, v)| (k.into_owned(), v.into_owned()))
            .collect();

        let mut serializer = form_urlencoded::Serializer::new(String::new());
        for (key, value) in pairs {
            if key != "fmt" {
                serializer.append_pair(&key, &value);
            }
        }

        let new_query = serializer.finish();
        if new_query.is_empty() {
            url.set_query(None);
        } else {
            url.set_query(Some(&new_query));
        }

        return url.to_string();
    }

    base_url.to_string()
}

async fn fetch_timed_transcript(id: &str, language: &str) -> Result<Vec<CaptionEntry>, String> {
    let client = Client::new();
    let video_url = format!("https://www.youtube.com/watch?v={}", id);

    let html = client
        .get(&video_url)
        .header(
            "User-Agent",
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        )
        .send()
        .await
        .map_err(|e| format!("Failed to fetch video page: {}", e))?
        .text()
        .await
        .map_err(|e| format!("Failed to read video page HTML: {}", e))?;

    let api_key_re = Regex::new(r#"INNERTUBE_API_KEY\":\"([^\"]+)\""#)
        .map_err(|e| format!("Failed to build API key regex: {}", e))?;
    let api_key = api_key_re
        .captures(&html)
        .and_then(|caps| caps.get(1).map(|m| m.as_str().to_string()))
        .ok_or_else(|| "INNERTUBE_API_KEY not found".to_string())?;

    let player_data = client
        .post(format!(
            "https://www.youtube.com/youtubei/v1/player?key={}",
            api_key
        ))
        .header("Content-Type", "application/json")
        .json(&json!({
            "context": {
                "client": {
                    "clientName": "ANDROID",
                    "clientVersion": "20.10.38"
                }
            },
            "videoId": id
        }))
        .send()
        .await
        .map_err(|e| format!("Failed to fetch player data: {}", e))?
        .json::<serde_json::Value>()
        .await
        .map_err(|e| format!("Failed to parse player data: {}", e))?;

    let tracks = player_data
        .pointer("/captions/playerCaptionsTracklistRenderer/captionTracks")
        .and_then(|v| v.as_array())
        .ok_or_else(|| "No captions found".to_string())?;

    let track = tracks
        .iter()
        .find(|t| t.get("languageCode").and_then(|v| v.as_str()) == Some(language))
        .ok_or_else(|| format!("No captions for language: {}", language))?;

    let base_url = track
        .get("baseUrl")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Caption track baseUrl missing".to_string())?;

    let transcript_url = strip_fmt_param(base_url);
    let xml = client
        .get(&transcript_url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch transcript XML: {}", e))?
        .text()
        .await
        .map_err(|e| format!("Failed to read transcript XML: {}", e))?;

    let mut reader = Reader::from_str(&xml);
    reader.trim_text(true);

    let mut buf = Vec::new();
    let mut entries: Vec<CaptionEntry> = Vec::new();
    let mut current_start: Option<f64> = None;
    let mut current_dur: Option<f64> = None;
    let mut current_text = String::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) if e.name().as_ref() == b"text" => {
                current_start = None;
                current_dur = None;
                current_text.clear();

                for attr in e.attributes().flatten() {
                    let key = attr.key.as_ref();
                    let value = attr
                        .unescape_value()
                        .map_err(|e| format!("Failed to unescape attribute: {}", e))?
                        .to_string();

                    if key == b"start" {
                        current_start = value.parse::<f64>().ok();
                    } else if key == b"dur" {
                        current_dur = value.parse::<f64>().ok();
                    }
                }
            }
            Ok(Event::Text(e)) => {
                current_text = e
                    .unescape()
                    .map_err(|e| format!("Failed to unescape text: {}", e))?
                    .to_string();
            }
            Ok(Event::CData(e)) => {
                current_text = String::from_utf8_lossy(e.as_ref()).to_string();
            }
            Ok(Event::End(e)) if e.name().as_ref() == b"text" => {
                if let (Some(start), Some(dur)) = (current_start, current_dur) {
                    entries.push(CaptionEntry {
                        caption: current_text.clone(),
                        start_time: start,
                        end_time: start + dur,
                    });
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(format!("Failed to parse transcript XML: {}", e)),
            _ => {}
        }

        buf.clear();
    }

    Ok(entries)
}

/// Fetches a YouTube transcript with timestamps, using the Innertube player API
///
/// # Arguments
/// * `id` - The YouTube video ID (e.g., "dQw4w9WgXcQ")
/// * `language` - Optional language code (ignored, always tries "en" then "es")
///
/// # Returns
/// A Result containing a vector of caption entries with timing, or an error
#[tauri::command]
pub async fn get_youtube_transcript_timed(
    app: AppHandle,
    id: String,
    _language: Option<String>,
) -> Result<Vec<CaptionEntry>, String> {
    app.emit(
        "flow-status",
        json!({"key": "transcript", "status": "Extracting timed transcript", "data": null}),
    )
    .map_err(|e| format!("Failed to emit flow-status event: {}", e))?;

    let entries = match fetch_timed_transcript(&id, "en").await {
        Ok(entries) => entries,
        Err(_) => fetch_timed_transcript(&id, "es").await?,
    };

    app.emit(
        "flow-status",
        json!({"key": "transcript", "status": "done", "data": null}),
    )
    .map_err(|e| format!("Failed to emit flow-status event: {}", e))?;

    Ok(entries)
}

/// Fetches a YouTube transcript as a single string, using the timed transcript API
///
/// # Arguments
/// * `id` - The YouTube video ID (e.g., "dQw4w9WgXcQ")
/// * `language` - Optional language code (ignored, always tries "en" then "es")
///
/// # Returns
/// A Result containing the full transcript as a String, or an error
#[tauri::command]
pub async fn get_youtube_transcript_timed_text(
    app: AppHandle,
    id: String,
    _language: Option<String>,
) -> Result<String, String> {
    app.emit(
        "flow-status",
        json!({"key": "transcript", "status": "Extracting transcript", "data": null}),
    )
    .map_err(|e| format!("Failed to emit flow-status event: {}", e))?;

    let entries = match fetch_timed_transcript(&id, "en").await {
        Ok(entries) => entries,
        Err(_) => fetch_timed_transcript(&id, "es").await?,
    };
    let transcript_text = entries
        .iter()
        .map(|entry| entry.caption.trim())
        .filter(|text| !text.is_empty())
        .collect::<Vec<&str>>()
        .join(" ");

    app.emit(
        "flow-status",
        json!({"key": "transcript", "status": "done", "data": null}),
    )
    .map_err(|e| format!("Failed to emit flow-status event: {}", e))?;

    Ok(transcript_text)
}