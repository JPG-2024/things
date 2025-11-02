use anyhow::Result;
use htmd::HtmlToMarkdown;
use scraper::{Html, Selector};
use tauri::{AppHandle, Emitter};
use std::collections::HashMap;
use serde::Serialize;

/// Función que extrae metadatos del documento HTML
#[tauri::command]
pub async fn extract_metadata(app: AppHandle, url: String) -> Result<HashMap<String, String>, String> {
    let (_html, document) = crate::browser::get_document(app, url).await?;
    extract_metadata_from_document(&document)
}

/// Función interna que extrae metadatos de un documento HTML parseado
fn extract_metadata_from_document(document: &Html) -> Result<HashMap<String, String>, String> {
    let mut metadata: HashMap<String, String> = HashMap::new();

    // Extraer metadatos de etiquetas <meta>
    if let Ok(meta_selector) = Selector::parse("meta") {
        for element in document.select(&meta_selector) {
            let name = element.value().attr("name")
                .or_else(|| element.value().attr("property"))
                .unwrap_or("");
            let content = element.value().attr("content").unwrap_or("");
            
            if !name.is_empty() && !content.is_empty() {
                metadata.insert(name.to_string(), content.to_string());
            }
        }
    }

    // Extraer título
    if let Ok(title_selector) = Selector::parse("title") {
        if let Some(title_el) = document.select(&title_selector).next() {
            if let Some(text) = title_el.text().next() {
                metadata.insert("title".to_string(), text.to_string());
            }
        }
    }

    println!("✅ Metadatos extraídos: {} elementos", metadata.len());

    Ok(metadata)
}

/// Función genérica que extrae contenido con selectores personalizados
#[tauri::command]
pub async fn extract_markdown(app: AppHandle, url: String, selectors: Vec<String>) -> Result<String, String> {
    let (html, document) = crate::browser::get_document(app.clone(), url).await?;
    
    app.emit("flow-status", "Extracting content...")
        .map_err(|e| format!("Failed to emit flow-status event: {}", e))?;
    
    extract_markdown_from_html(&html, &document, selectors)
}

/// Función interna que convierte HTML a markdown usando selectores personalizados
fn extract_markdown_from_html(html: &str, document: &Html, selectors: Vec<String>) -> Result<String, String> {
    let selector_strs: Vec<&str> = selectors.iter().map(|s| s.as_str()).collect();
    
    let main_html = selector_strs.iter()
        .find_map(|selector| {
            Selector::parse(selector)
                .ok()
                .and_then(|sel| {
                    let elements: Vec<String> = document
                        .select(&sel)
                        .map(|el| el.html())
                        .collect();
                    
                    if !elements.is_empty() {
                        Some(elements.join("\n"))
                    } else {
                        None
                    }
                })
        })
        .unwrap_or_else(|| html.to_string());

    
    let converter = HtmlToMarkdown::builder()
        .skip_tags(vec!["nav", "footer", "header", "script", "style", "aside", "img", "video"])
        .scripting_enabled(false)
        .build();

    let markdown = converter.convert(&main_html).map_err(|e| e.to_string())?;

    Ok(markdown)
}

/// Estructura que contiene metadatos y contenido markdown de un blog
#[derive(Serialize)]
pub struct BlogContent {
    pub metadata: HashMap<String, String>,
    pub markdown: String,
}

/// Comando que extrae metadatos y markdown de un blog en una sola operación
#[tauri::command]
pub async fn extract_blog(app: AppHandle, url: String, selectors: Vec<String>) -> Result<BlogContent, String> {
    // Obtener documento una sola vez
    let (html, document) = crate::browser::get_document(app.clone(), url).await?;
    
    // Extraer metadatos
    let metadata = extract_metadata_from_document(&document)?;
    
    // Emitir evento de progreso
    app.emit("flow-status", "Extracting content...")
        .map_err(|e| format!("Failed to emit flow-status event: {}", e))?;
    
    // Extraer markdown
    let markdown = extract_markdown_from_html(&html, &document, selectors)?;
    
    println!("✅ Blog extraído completamente");
    
    Ok(BlogContent { metadata, markdown })
}
