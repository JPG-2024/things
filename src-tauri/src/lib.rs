use chromiumoxide::browser::{Browser, BrowserConfig};
use futures::StreamExt;
use anyhow::Result;
use tokio::sync::Mutex;
use std::sync::Arc;
use lazy_static::lazy_static;
use htmd::HtmlToMarkdown;
use scraper::{Html, Selector};
use once_cell::sync::Lazy;
use regex::Regex;
use std::future::Future;
use std::pin::Pin;
use serde::{Deserialize};
use std::path::PathBuf;
use reqwest::Client;

type BoxedFut<'a> = Pin<Box<dyn Future<Output = Result<String>> + Send + 'a>>;

#[derive(Deserialize)]
struct AntiDetectConfig {
    user_agent: String,
    accept_language: String,
    platform: String,
    script: String,
}

lazy_static! {
    static ref BROWSER: Arc<Mutex<Option<Browser>>> = Arc::new(Mutex::new(None));
}

static GITHUB_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"github\.com").unwrap());
static GITLAB_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"gitlab\.com").unwrap());
static MEDIUM_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"medium\.com").unwrap());

/// Carga la configuración de anti-detección desde el archivo JSON
fn load_antidetect_config() -> Result<AntiDetectConfig> {
    let config_str = include_str!("../antidetect.json");
    serde_json::from_str(config_str).map_err(|e| anyhow::anyhow!("Error cargando config: {}", e))
}

/// Carga la configuración del navegador desde el archivo JSON
fn load_browser_config() -> Result<Vec<String>> {
    let config_str = include_str!("../browser_config.json");
    let config: serde_json::Value = serde_json::from_str(config_str)?;
    let args = config["chrome_args"]
        .as_array()
        .ok_or_else(|| anyhow::anyhow!("No chrome_args found in browser_config.json"))?
        .iter()
        .filter_map(|v| v.as_str().map(|s| s.to_string()))
        .collect();
    Ok(args)
}

/// Inicializa el navegador una sola vez
async fn init_browser() -> Result<()> {
    let mut browser_lock = BROWSER.lock().await;
    
    if browser_lock.is_some() {
        return Ok(());
    }

    let chrome_path = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    // Ensure chromiumoxide runner uses a unique temp dir for this process to
    // avoid collisions with stale SingletonLock files from previous runs.
    // We set TMPDIR to a per-process directory under the system temp dir.
    let runner_tmp = std::env::temp_dir().join(format!("chromiumoxide-runner-{}", std::process::id()));
    std::fs::create_dir_all(&runner_tmp).map_err(|e| anyhow::anyhow!(e))?;
    std::env::set_var("TMPDIR", runner_tmp.as_os_str());

    let chrome_args = load_browser_config()?;
    let config = BrowserConfig::builder()
        .chrome_executable(chrome_path)
        .disable_default_args()
        .args(chrome_args)
        .build()
        .map_err(|e| anyhow::anyhow!(e))?;

    let (browser, mut handler) = Browser::launch(config).await?;

    tokio::spawn(async move {
        while let Some(h) = handler.next().await {
            if h.is_err() {
                break;
            }
        }
    });

    *browser_lock = Some(browser);
    Ok(())
}

/// Verifica si el navegador está listo
#[tauri::command]
async fn is_browser_ready() -> bool {
    let browser_lock = BROWSER.lock().await;
    browser_lock.is_some()
}

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
    extract_content_with_selectors(url, vec!["article", "[data-post-id]"]).await
}

/// Extrae contenido por defecto
async fn fetch_default(url: &str) -> Result<String> {
    println!("🌐 Extrayendo desde URL genérica: {}", url);
    extract_content_with_selectors(url, vec!["article", "main"]).await
}

/// Configura una página con anti-detección y user agent
async fn configure_page(page: &chromiumoxide::Page) -> Result<()> {
    let config = load_antidetect_config()?;
    
    page.execute(chromiumoxide::cdp::browser_protocol::emulation::SetUserAgentOverrideParams {
        user_agent: config.user_agent,
        accept_language: Some(config.accept_language),
        platform: Some(config.platform),
        user_agent_metadata: None,
    })
    .await?;

    page.evaluate(config.script.as_str())
        .await?;

    Ok(())
}

/// Obtiene una página configurada y lista para usar
async fn get_ready_page() -> Result<chromiumoxide::Page> {
    init_browser().await?;

    let browser_lock = BROWSER.lock().await;
    let browser = browser_lock.as_ref()
        .ok_or_else(|| anyhow::anyhow!("Browser not initialized"))?;

    let page = browser.new_page("about:blank").await?;
    drop(browser_lock);

    configure_page(&page).await?;
    
    Ok(page)
}

/// Función genérica que extrae contenido con selectores personalizados
async fn extract_content_with_selectors(url: &str, selectors: Vec<&str>) -> Result<String> {
    let page = get_ready_page().await?;

    page.goto(url).await?;
    page.wait_for_navigation().await?;
    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

    let html: String = page.content().await?;
    let document = Html::parse_document(&html);
    
    // Extraer meta tags (og:title)
    let meta_selector = Selector::parse("meta[property=\"og:title\"]").unwrap();
    if let Some(meta_tag) = document.select(&meta_selector).next() {
        if let Some(content) = meta_tag.value().attr("content") {
            println!("Title: {}", content);
        }
    }

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

/// Extrae los src de las imágenes sin mantener el Html en el Future
fn extract_image_srcs(html: &str, base_url: &str) -> Vec<String> {
    let document = Html::parse_document(html);
    let img_selector = match Selector::parse("img") {
        Ok(sel) => sel,
        Err(_) => return Vec::new(),
    };

    document.select(&img_selector)
        .filter_map(|img| img.value().attr("src"))
        .map(|src| {
            if src.starts_with("http") {
                src.to_string()
            } else if src.starts_with("/") {
                match url::Url::parse(base_url) {
                    Ok(parsed_url) => {
                        let base = format!("{}://{}", parsed_url.scheme(), parsed_url.host_str().unwrap_or(""));
                        format!("{}{}", base, src)
                    },
                    Err(_) => src.to_string(),
                }
            } else {
                match url::Url::parse(base_url) {
                    Ok(parsed_url) => {
                        let base_path = parsed_url.path().trim_end_matches('/');
                        let base = format!("{}://{}{}/", parsed_url.scheme(), parsed_url.host_str().unwrap_or(""), base_path);
                        format!("{}{}", base, src)
                    },
                    Err(_) => src.to_string(),
                }
            }
        })
        .collect()
}

/// Descarga todas las imágenes de una URL y las guarda en el disco
#[tauri::command]
async fn download_images(url: String, output_dir: String) -> Result<Vec<String>, String> {
    let page = get_ready_page().await.map_err(|e| e.to_string())?;

    page.goto(&url).await.map_err(|e| e.to_string())?;
    page.wait_for_navigation().await.map_err(|e| e.to_string())?;
    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

    let html: String = page.content().await.map_err(|e| e.to_string())?;
    
    // Procesar HTML inmediatamente y extraer solo los URLs
    let img_urls = extract_image_srcs(&html, &url);

    // Crear directorio si no existe
    let dir_path = PathBuf::from(&output_dir);
    std::fs::create_dir_all(&dir_path).map_err(|e| format!("Error creating directory: {}", e))?;

    let client = Client::new();
    let mut downloaded_files = Vec::new();

    for (index, full_url) in img_urls.into_iter().enumerate() {
        // Extraer nombre del archivo
        let filename = full_url.split('/').last().unwrap_or("").to_string();
        // Remover query string (todo lo que sigue después de ?)
        let filename = filename.split('?').next().unwrap_or("").to_string();
        let filename = if filename.is_empty() {
            format!("image_{}.jpg", index)
        } else {
            filename
        };
        let file_path = dir_path.join(&filename);

        println!("Descargando imagen: {}", full_url);

        match client.get(&full_url).send().await {
            Ok(response) => {
                match response.bytes().await {
                    Ok(bytes) => {
                        match std::fs::write(&file_path, bytes) {
                            Ok(_) => {
                                let relative_path = file_path.to_string_lossy().to_string();
                                downloaded_files.push(relative_path);
                                println!("✅ Imagen guardada: {:?}", file_path);
                            },
                            Err(e) => eprintln!("❌ Error escribiendo archivo: {}", e),
                        }
                    },
                    Err(e) => eprintln!("❌ Error leyendo respuesta: {}", e),
                }
            },
            Err(e) => eprintln!("❌ Error descargando imagen {}: {}", full_url, e),
        }
    }

    Ok(downloaded_files)
}


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let _ = init_browser().await;
            });
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![extract_url_to_markdown, is_browser_ready, download_images])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
