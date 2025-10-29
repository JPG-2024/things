use anyhow::Result;
use htmd::HtmlToMarkdown;
use scraper::{Html, Selector};
use once_cell::sync::Lazy;
use regex::Regex;
use std::future::Future;
use std::pin::Pin;

mod images;
pub use crate::images::download_images;

mod browser;
pub use crate::browser::init_browser;

mod inference_openrouter;
pub use crate::inference_openrouter::{inference};

type BoxedFut<'a> = Pin<Box<dyn Future<Output = Result<String>> + Send + 'a>>;

static GITHUB_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"github\.com").unwrap());
static GITLAB_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"gitlab\.com").unwrap());
static MEDIUM_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"medium\.com").unwrap());


/// Extrae el contenido de una URL
#[tauri::command]
async fn extract_url_to_markdown(url: String) -> Result<String, String> {
    dispatch(&url)
        .await
        .map_err(|e| e.to_string())
}

/// Dispatcher que redirige según el tipo de URL
async fn dispatch(url: &str) -> Result<String> {
    let host = match url::Url::parse(url) {
        Ok(u) => u.host_str().map(|s| s.to_string()).unwrap_or_default(),
        Err(_) => return Err(anyhow::anyhow!("URL inválida")),
    };

    let fut: BoxedFut = if GITHUB_RE.is_match(&host) {
        Box::pin(fetch_github(url))
    } else if GITLAB_RE.is_match(&host) {
        Box::pin(fetch_gitlab(url))
    } else if MEDIUM_RE.is_match(&host) {
        Box::pin(fetch_medium(url))
    } else {
        Box::pin(async { fetch_default(url).await })
    };

    fut.await
}

/// Extrae contenido de GitHub
async fn fetch_github(url: &str) -> Result<String> {
    println!("📘 Extrayendo desde GitHub: {}", url);
    extract_content_with_selectors(url, vec!["article", "main", "[role='main']"]).await
}

/// Extrae contenido de GitLab
async fn fetch_gitlab(url: &str) -> Result<String> {
    println!("🦊 Extrayendo desde GitLab: {}", url);
    extract_content_with_selectors(url, vec!["main", "article"]).await
}

/// Extrae contenido de Medium
async fn fetch_medium(url: &str) -> Result<String> {
    println!("📰 Extrayendo desde Medium: {}", url);
    extract_content_with_selectors(url, vec!["meta[property=\"og:title\"]", "article"]).await
}

/// Extrae contenido por defecto
async fn fetch_default(url: &str) -> Result<String> {
    println!("🌐 Extrayendo desde URL genérica: {}", url);
    extract_content_with_selectors(url, vec!["article", "main"]).await
}

// `get_ready_page`, `configure_page` and `init_browser` moved to `browser` module.

/// Función genérica que extrae contenido con selectores personalizados
async fn extract_content_with_selectors(url: &str, selectors: Vec<&str>) -> Result<String> {
    let page = crate::browser::get_ready_page().await?;

    page.goto(url).await?;
    page.wait_for_navigation().await?;
    // tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;

    let html: String = page.content().await?;
    let document = Html::parse_document(&html);

    println!("✅ Página cargada: {}", url);


    // Buscar contenido principal con los selectores proporcionados
    // Ahora itera sobre TODOS los elementos que coinciden
    let main_html = selectors.iter()
        .find_map(|selector| {
            Selector::parse(selector)
                .ok()
                .and_then(|sel| {
                    let elements: Vec<String> = document
                        .select(&sel)
                        .map(|el| el.html())
                        .collect();
                    
                    if !elements.is_empty() {
                        // Combinar todos los elementos encontrados
                        Some(elements.join("\n"))
                    } else {
                        None
                    }
                })
        })
        .unwrap_or_else(|| html.to_string());

    // Convertir HTML a Markdown
    let converter = HtmlToMarkdown::builder()
        .skip_tags(vec!["nav", "footer", "header", "script", "style", "aside", "img", "video"])
        .scripting_enabled(false)
        .build();

    let markdown = converter.convert(&main_html)?;

    Ok(markdown)
}


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Load environment variables from .env file
    dotenv::dotenv().ok();

    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let _ = crate::browser::init_browser().await;
            });
            Ok(())
        })
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![extract_url_to_markdown, download_images, inference])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
