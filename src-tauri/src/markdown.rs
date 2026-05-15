use anyhow::Result;
use htmd::HtmlToMarkdown;
use scraper::{Html, Selector};
use serde::Serialize;
use serde_json::json;
use std::collections::HashMap;
use tauri::{AppHandle, Emitter};

/// Función que extrae metadatos del documento HTML
#[tauri::command]
pub async fn extract_metadata(
    app: AppHandle,
    url: String,
) -> Result<HashMap<String, String>, String> {
    let app_clone = app.clone();
    let result = crate::browser::with_shared_page(|page| async move {
        app_clone.emit(
            "flow-status",
            json!({"key": "page", "status": "Loading Page", "data": null}),
        )
        .map_err(|e| e.to_string())?;

        tokio::time::timeout(crate::browser::PAGE_OP_TIMEOUT, page.goto(&url))
            .await
            .map_err(|_| "Page navigation timed out".to_string())?
            .map_err(|e| e.to_string())?;

        let html: String = tokio::time::timeout(crate::browser::PAGE_OP_TIMEOUT, page.content())
            .await
            .map_err(|_| "Page content extraction timed out".to_string())?
            .map_err(|e| e.to_string())?;

        let document = Html::parse_document(&html);
        let metadata = extract_metadata_from_document(&app_clone, &document)?;

        app_clone.emit(
            "flow-status",
            json!({"key": "page", "status": "done", "data": null}),
        )
        .map_err(|e| e.to_string())?;

        Ok(metadata)
    })
    .await?;

    Ok(result)
}

/// Función interna que extrae metadatos de un documento HTML parseado
fn extract_metadata_from_document(
    app: &AppHandle,
    document: &Html,
) -> Result<HashMap<String, String>, String> {
    app.emit(
        "flow-status",
        json!({"key": "metadata", "status": "Extracting metadata", "data": null}),
    )
    .map_err(|e| format!("Failed to emit flow-status event: {}", e))?;

    let mut metadata: HashMap<String, String> = HashMap::new();

    // Extraer metadatos de etiquetas <meta>
    if let Ok(meta_selector) = Selector::parse("meta") {
        for element in document.select(&meta_selector) {
            let name = element
                .value()
                .attr("name")
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

    app.emit(
        "flow-status",
        json!({"key": "metadata", "status": "done", "data": metadata.clone()}),
    )
    .map_err(|e| format!("Failed to emit flow-status event: {}", e))?;

    Ok(metadata)
}

/// Función genérica que extrae contenido con selectores personalizados
#[tauri::command]
pub async fn extract_markdown(
    app: AppHandle,
    url: String,
    selectors: Vec<String>,
) -> Result<String, String> {
    let app_clone = app.clone();
    let markdown = crate::browser::with_shared_page(|page| async move {
        app_clone.emit(
            "flow-status",
            json!({"key": "page", "status": "Loading Page", "data": null}),
        )
        .map_err(|e| e.to_string())?;

        tokio::time::timeout(crate::browser::PAGE_OP_TIMEOUT, page.goto(&url))
            .await
            .map_err(|_| "Page navigation timed out".to_string())?
            .map_err(|e| e.to_string())?;

        let html: String = tokio::time::timeout(crate::browser::PAGE_OP_TIMEOUT, page.content())
            .await
            .map_err(|_| "Page content extraction timed out".to_string())?
            .map_err(|e| e.to_string())?;

        let document = Html::parse_document(&html);
        let markdown = extract_markdown_from_html(&app_clone, &html, &document, selectors)?;

        app_clone.emit(
            "flow-status",
            json!({"key": "page", "status": "done", "data": null}),
        )
        .map_err(|e| e.to_string())?;

        Ok(markdown)
    })
    .await?;

    Ok(markdown)
}

/// Función interna que convierte HTML a markdown usando selectores personalizados
fn extract_markdown_from_html(
    app: &AppHandle,
    html: &str,
    document: &Html,
    selectors: Vec<String>,
) -> Result<String, String> {
    app.emit(
        "flow-status",
        json!({"key": "markdown", "status": "Extracting markdown", "data": null}),
    )
    .map_err(|e| format!("Failed to emit flow-status event: {}", e))?;

    let selector_strs: Vec<&str> = selectors.iter().map(|s| s.as_str()).collect();

    let main_html = selector_strs
        .iter()
        .find_map(|selector| {
            Selector::parse(selector).ok().and_then(|sel| {
                let elements: Vec<String> = document.select(&sel).map(|el| el.html()).collect();

                if !elements.is_empty() {
                    Some(elements.join("\n"))
                } else {
                    None
                }
            })
        })
        .unwrap_or_else(|| html.to_string());

    let converter = HtmlToMarkdown::builder()
        .skip_tags(vec![
            "nav", "footer", "header", "script", "style", "aside", "img", "video",
        ])
        .scripting_enabled(false)
        .build();

    let markdown = converter.convert(&main_html).map_err(|e| e.to_string())?;

    app.emit(
        "flow-status",
        json!({"key": "markdown", "status": "done", "data": markdown.clone()}),
    )
    .map_err(|e| format!("Failed to emit flow-status event: {}", e))?;

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
pub async fn extract_blog(
    app: AppHandle,
    url: String,
    selectors: Vec<String>,
) -> Result<BlogContent, String> {
    let app_for_metadata = app.clone();
    let app_for_markdown = app.clone();

    let result = crate::browser::with_shared_page(|page| async move {
        app_for_metadata.emit(
            "flow-status",
            json!({"key": "page", "status": "Loading Page", "data": null}),
        )
        .map_err(|e| e.to_string())?;

        tokio::time::timeout(crate::browser::PAGE_OP_TIMEOUT, page.goto(&url))
            .await
            .map_err(|_| "Page navigation timed out".to_string())?
            .map_err(|e| e.to_string())?;

        let html: String = tokio::time::timeout(crate::browser::PAGE_OP_TIMEOUT, page.content())
            .await
            .map_err(|_| "Page content extraction timed out".to_string())?
            .map_err(|e| e.to_string())?;

        println!("✅ Página cargada: {}", url);

        app_for_metadata.emit(
            "flow-status",
            json!({"key": "page", "status": "done", "data": null}),
        )
        .map_err(|e| e.to_string())?;

        let document = Html::parse_document(&html);

        let metadata = extract_metadata_from_document(&app_for_metadata, &document)?;

        app_for_metadata.emit(
            "flow-status",
            json!({"key": "metadata", "status": "done", "data": metadata.clone()}),
        )
        .map_err(|e| format!("Failed to emit flow-status event: {}", e))?;

        let markdown = extract_markdown_from_html(&app_for_markdown, &html, &document, selectors)?;

        println!("<< ✅ Blog extraído completamente >>");
        println!("Metadatos extraídos: {} elementos", markdown);

        Ok(BlogContent { metadata, markdown })
    })
    .await?;

    Ok(result)
}
