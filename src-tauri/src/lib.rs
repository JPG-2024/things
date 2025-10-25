use chromiumoxide::browser::{Browser, BrowserConfig};
use futures::StreamExt;
use anyhow::Result;
use tokio::sync::Mutex;
use std::sync::Arc;
use lazy_static::lazy_static;

lazy_static! {
    static ref BROWSER: Arc<Mutex<Option<Browser>>> = Arc::new(Mutex::new(None));
}

/// Inicializa el navegador una sola vez
async fn init_browser() -> Result<()> {
    let mut browser_lock = BROWSER.lock().await;
    
    if browser_lock.is_some() {
        return Ok(());
    }

    let chrome_path = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    
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
            "--incognito=false",
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

/// Extrae el contenido de una URL
#[tauri::command]
async fn extract_url_to_markdown(url: String) -> Result<String, String> {
    extract_content_to_markdown(&url)
        .await
        .map_err(|e| e.to_string())
}

/// Función que extrae contenido - OPTIMIZADA PARA CONCURRENCIA
async fn extract_content_to_markdown(url: &str) -> Result<String> {
    init_browser().await?;

    // Obtener el browser
    let browser_lock = BROWSER.lock().await;
    let browser = browser_lock.as_ref()
        .ok_or_else(|| anyhow::anyhow!("Browser not initialized"))?;

    // Crear página (esto NO bloquea otras páginas)
    let page = browser.new_page("about:blank").await?;
    
    // LIBERAR EL LOCK aquí para que otras llamadas puedan crear páginas simultáneamente
    drop(browser_lock);

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

    page.goto(url).await?;
    page.wait_for_navigation().await?;
    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

    let html: String = page.content().await?;
    let markdown = html2md::parse_html(&html);

    Ok(markdown)
}


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![extract_url_to_markdown])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
