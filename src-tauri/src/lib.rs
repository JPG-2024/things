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

type BoxedFut<'a> = Pin<Box<dyn Future<Output = Result<String>> + Send + 'a>>;

lazy_static! {
    static ref BROWSER: Arc<Mutex<Option<Browser>>> = Arc::new(Mutex::new(None));
}

static GITHUB_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"github\.com").unwrap());
static GITLAB_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"gitlab\.com").unwrap());
static MEDIUM_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"medium\.com").unwrap());

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

    let config = BrowserConfig::builder()
        .chrome_executable(chrome_path)
        .disable_default_args()
        .args(vec![
            "--disable-blink-features=AutomationControlled",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-web-security",
            "--disable-features=IsolateOrigins,site-per-process",
            "--disable-infobars",
            "--window-size=1920,1080",
            "--start-maximized",
            "--exclude-switches=enable-automation",
            "--disable-extensions",
            "--profile-directory=Default",
            "--incognito",
        ])
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
    let user_agent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    
    page.execute(chromiumoxide::cdp::browser_protocol::emulation::SetUserAgentOverrideParams {
        user_agent: user_agent.to_string(),
        accept_language: Some("es-ES,es;q=0.9,en;q=0.8".to_string()),
        platform: Some("MacIntel".to_string()),
        user_agent_metadata: None,
    })
    .await?;

    page.evaluate(
        r#"
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        Object.defineProperty(navigator, 'languages', { get: () => ['es-ES', 'es', 'en'] });
        window.chrome = { runtime: {} };
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) => (
            parameters.name === 'notifications' ?
                Promise.resolve({ state: Notification.permission }) :
                originalQuery(parameters) 
        );
        "#,
    )
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
        .invoke_handler(tauri::generate_handler![extract_url_to_markdown, is_browser_ready])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
