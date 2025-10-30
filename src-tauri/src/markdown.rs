use anyhow::Result;
use htmd::HtmlToMarkdown;
use scraper::{Html, Selector};

/// Función genérica que extrae contenido con selectores personalizados
#[tauri::command]
pub async fn extract_markdown(url: String, selectors: Vec<String>) -> Result<String, String> {
    let page = crate::browser::get_ready_page().await.map_err(|e| e.to_string())?;

    page.goto(&url).await.map_err(|e| e.to_string())?;
    page.wait_for_navigation().await.map_err(|e| e.to_string())?;

    let html: String = page.content().await.map_err(|e| e.to_string())?;
    let document = Html::parse_document(&html);

    println!("✅ Página cargada: {}", url);

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
