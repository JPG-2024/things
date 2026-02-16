use anyhow::Result;
use chromiumoxide::browser::{Browser, BrowserConfig};
use scraper::Html;
use serde::Deserialize;
use serde_json::json;
use futures_util::StreamExt;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::OnceCell;

#[derive(Deserialize)]
struct AntiDetectConfig {
    user_agent: String,
    accept_language: String,
    platform: String,
    script: String,
}

pub static BROWSER: OnceCell<Arc<Browser>> = OnceCell::const_new();

/// Carga la configuración de anti-detección desde el archivo JSON
fn load_antidetect_config() -> Result<AntiDetectConfig> {
    let config_str = include_str!("../antidetect.json");
    serde_json::from_str(config_str).map_err(|e| anyhow::anyhow!("Error cargando config: {}", e))
}

/// Carga la configuración del navegador desde el archivo JSON
/*
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
*/
/// Inicializa el browser globalmente si aún no está inicializado
#[tauri::command]
pub async fn init_browser() -> Result<(), String> {
    // Kill any existing chromium processes first
    let _ = std::process::Command::new("pkill")
        .arg("-9")
        .arg("-f")
        .arg("chromiumoxide-runner")
        .output();

    // Give processes time to die
    std::thread::sleep(std::time::Duration::from_millis(500));

    let mut config = BrowserConfig::builder();
        

    // Auto-detect browser
    let chrome_path = find_chrome_executable()?;
    config = config.chrome_executable(&chrome_path);
    println!("🌐 Using browser: {}", chrome_path);

    // Use a unique, clean user data directory
    let user_data_dir = format!("/tmp/chromium-profile-{}", std::process::id());

    // Clean up old directory if it exists
    let _ = std::fs::remove_dir_all(&user_data_dir);
    std::fs::create_dir_all(&user_data_dir)
        .map_err(|e| format!("Failed to create user data dir: {}", e))?;

    config = config
        .arg(format!("--user-data-dir={}", user_data_dir))
        .arg("--no-first-run")
        .arg("--no-default-browser-check")
        .arg("--disable-sync");

    let config = config.build().map_err(|e| {
        let error_msg = e.to_string();
        eprintln!("❌ Error configurando browser: {}", error_msg);
        error_msg
    })?;

    let (browser, mut handler) = Browser::launch(config).await.map_err(|e| {
        let error_msg = e.to_string();
        eprintln!("❌ Error lanzando browser: {}", error_msg);
        error_msg
    })?;

    tokio::spawn(async move { while (handler.next().await).is_some() {} });

    BROWSER
        .set(Arc::new(browser))
        .map_err(|_| "Browser ya inicializado".to_string())?;

    println!("✅ Browser inicializado");
    Ok(())
}

/// Configura una página con anti-detección y user agent
pub async fn configure_page(page: &chromiumoxide::Page) -> Result<()> {
    let config = load_antidetect_config()?;
    page.execute(
        chromiumoxide::cdp::browser_protocol::emulation::SetUserAgentOverrideParams {
            user_agent: config.user_agent,
            accept_language: Some(config.accept_language),
            platform: Some(config.platform),
            user_agent_metadata: None,
        },
    )
    .await?;

    page.evaluate(config.script.as_str()).await?;

    Ok(())
}

/// Obtiene una página configurada y lista para usar
pub async fn get_ready_page() -> Result<chromiumoxide::Page> {
    // Tomar la instancia del browser inicializado
    let browser = BROWSER
        .get()
        .ok_or_else(|| anyhow::anyhow!("Browser no inicializado"))?
        .clone();

    // Crear nueva página
    let page = browser.new_page("about:blank").await?;

    // Configurar la página automáticamente
    configure_page(&page).await?;

    Ok(page)
}

/// Navega a una URL y retorna el HTML y documento parseado
pub async fn get_document(app: AppHandle, url: String) -> Result<(String, Html), String> {
    app.emit(
        "flow-status",
        json!({"key": "page", "status": "Loading Page", "data": null}),
    ).map_err(|e| e.to_string())?;

    let page = get_ready_page().await.map_err(|e| e.to_string())?;

    page.goto(&url).await.map_err(|e| e.to_string())?;
    page.wait_for_navigation()
        .await
        .map_err(|e| e.to_string())?;

    let html: String = page.content().await.map_err(|e| e.to_string())?;
    let document = Html::parse_document(&html);

    println!("✅ Página cargada: {}", url);

    app.emit(
        "flow-status",
        json!({"key": "page", "status": "done", "data": null}),
    ).map_err(|e| e.to_string())?;

    Ok((html, document))
}

fn find_chrome_executable() -> Result<String, String> {
    let possible_paths = vec![
        // Linux paths
        "/usr/bin/google-chrome",
        "/usr/bin/google-chrome-stable",
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
        "/snap/bin/chromium",
        "/usr/bin/brave-browser",
        // macOS paths
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    ];

    for path in possible_paths {
        if std::path::Path::new(path).exists() {
            return Ok(path.to_string());
        }
    }

    Err("No Chromium-based browser found".to_string())
}
