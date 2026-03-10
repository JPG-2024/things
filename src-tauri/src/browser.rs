use anyhow::Result;
use chromiumoxide::browser::{Browser, BrowserConfig};
use futures_util::StreamExt;
use scraper::Html;
use serde::Deserialize;
use serde_json::json;
use std::future::Future;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::{Mutex, OwnedSemaphorePermit, Semaphore};
use tokio::task::JoinHandle;
use tokio::time::{sleep, Duration};

const MAX_CONCURRENT_PAGES: usize = 2;
const IDLE_BROWSER_SHUTDOWN_DELAY_SECS: u64 = 5;

#[derive(Deserialize)]
struct AntiDetectConfig {
    user_agent: String,
    accept_language: String,
    platform: String,
    script: String,
}

struct BrowserState {
    browser: Arc<Mutex<Browser>>,
    handler_task: JoinHandle<()>,
    page_semaphore: Arc<Semaphore>,
    user_data_dir: String,
    idle_generation: u64,
}

#[derive(Clone)]
struct BrowserContext {
    browser: Arc<Mutex<Browser>>,
    page_semaphore: Arc<Semaphore>,
}

pub struct ReadyPage {
    page: chromiumoxide::Page,
    _permit: OwnedSemaphorePermit,
}

impl std::ops::Deref for ReadyPage {
    type Target = chromiumoxide::Page;

    fn deref(&self) -> &Self::Target {
        &self.page
    }
}

impl ReadyPage {
    pub fn into_inner(self) -> chromiumoxide::Page {
        self.page
    }
}

pub static BROWSER_STATE: Mutex<Option<BrowserState>> = Mutex::const_new(None);

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
fn build_user_data_dir() -> String {
    format!(
        "/tmp/chromium-profile-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_millis())
            .unwrap_or_default()
    )
}

fn cleanup_user_data_dir(user_data_dir: &str) {
    if let Err(error) = std::fs::remove_dir_all(user_data_dir) {
        eprintln!("Failed to clean browser profile '{}': {}", user_data_dir, error);
    }
}

async fn launch_browser_state() -> Result<BrowserState, String> {
    let mut config = BrowserConfig::builder();

    let chrome_path = find_chrome_executable()?;
    config = config.chrome_executable(&chrome_path);
    println!("🌐 Using browser: {}", chrome_path);

    let user_data_dir = build_user_data_dir();
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

    let handler_task = tokio::spawn(async move {
        while let Some(event) = handler.next().await {
            if let Err(error) = event {
                eprintln!("Browser handler error: {}", error);
                break;
            }
        }
    });

    println!("✅ Browser inicializado");

    Ok(BrowserState {
        browser: Arc::new(Mutex::new(browser)),
        handler_task,
        page_semaphore: Arc::new(Semaphore::new(MAX_CONCURRENT_PAGES)),
        user_data_dir,
        idle_generation: 0,
    })
}

async fn ensure_browser() -> Result<BrowserContext, String> {
    let mut state = BROWSER_STATE.lock().await;

    if state.is_none() {
        *state = Some(launch_browser_state().await?);
    }

    if let Some(state) = state.as_mut() {
        state.idle_generation = state.idle_generation.wrapping_add(1);
    }

    let state = state
        .as_ref()
        .ok_or_else(|| "Browser state is unavailable".to_string())?;

    Ok(BrowserContext {
        browser: state.browser.clone(),
        page_semaphore: state.page_semaphore.clone(),
    })
}

/// Inicializa el browser globalmente si aún no está inicializado
#[tauri::command]
pub async fn init_browser() -> Result<(), String> {
    let _ = ensure_browser().await?;
    Ok(())
}

pub async fn shutdown_browser() -> Result<(), String> {
    let state = {
        let mut state = BROWSER_STATE.lock().await;
        state.take()
    };

    if let Some(state) = state {
        if let Err(error) = state.browser.lock().await.close().await {
            eprintln!("Failed to close browser: {}", error);
        }

        state.handler_task.abort();
        cleanup_user_data_dir(&state.user_data_dir);
    }

    Ok(())
}

fn schedule_idle_browser_shutdown() {
    tokio::spawn(async move {
        let generation = {
            let mut state = BROWSER_STATE.lock().await;
            match state.as_mut() {
                Some(state)
                    if state.page_semaphore.available_permits() == MAX_CONCURRENT_PAGES =>
                {
                    state.idle_generation = state.idle_generation.wrapping_add(1);
                    state.idle_generation
                }
                _ => return,
            }
        };

        sleep(Duration::from_secs(IDLE_BROWSER_SHUTDOWN_DELAY_SECS)).await;

        let state = {
            let mut state = BROWSER_STATE.lock().await;
            let should_take = state.as_ref().map_or(false, |s| {
                s.idle_generation == generation
                    && s.page_semaphore.available_permits() == MAX_CONCURRENT_PAGES
            });
            if should_take { state.take() } else { None }
        };

        if let Some(state) = state {
            if let Err(error) = state.browser.lock().await.close().await {
                eprintln!("Failed to close idle browser: {}", error);
            }

            state.handler_task.abort();
            cleanup_user_data_dir(&state.user_data_dir);
            println!("🧹 Browser cerrado por inactividad");
        }
    });
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
pub async fn get_ready_page() -> Result<ReadyPage> {
    let browser_context = ensure_browser().await.map_err(anyhow::Error::msg)?;
    let permit = browser_context
        .page_semaphore
        .clone()
        .acquire_owned()
        .await
        .map_err(|e| anyhow::anyhow!("Failed to acquire browser page slot: {}", e))?;

    let page = match browser_context.browser.lock().await.new_page("about:blank").await {
        Ok(page) => page,
        Err(error) => {
            drop(permit);
            return Err(anyhow::anyhow!("Failed to create browser page: {}", error));
        }
    };

    if let Err(error) = configure_page(&page).await {
        close_page(page).await;
        return Err(anyhow::anyhow!("Failed to configure page: {}", error));
    }

    Ok(ReadyPage {
        page,
        _permit: permit,
    })
}

pub async fn close_page(page: chromiumoxide::Page) {
    if let Err(error) = page.close().await {
        eprintln!("Failed to close browser page: {}", error);
    }
}

pub async fn close_ready_page(page: ReadyPage) {
    let page_handle = page.page.clone();
    close_page(page_handle).await;
    drop(page);
    schedule_idle_browser_shutdown();
}

pub async fn with_ready_page<T, F, Fut>(work: F) -> Result<T, String>
where
    F: FnOnce(chromiumoxide::Page) -> Fut,
    Fut: Future<Output = Result<T, String>>,
{
	let page = get_ready_page()
		.await
		.map_err(|e| format!("Failed to get browser page: {}", e))?;
	let page_handle = page.page.clone();

	let result = work(page_handle.clone()).await;
	close_ready_page(page).await;

	result
}

/// Navega a una URL y retorna el HTML y documento parseado
pub async fn get_document(app: AppHandle, url: String) -> Result<(String, Html), String> {
    app.emit(
        "flow-status",
        json!({"key": "page", "status": "Loading Page", "data": null}),
    ).map_err(|e| e.to_string())?;

    let html = with_ready_page(|page| async move {
        page.goto(&url).await.map_err(|e| e.to_string())?;
        page.wait_for_navigation()
            .await
            .map_err(|e| e.to_string())?;

        let html: String = page.content().await.map_err(|e| e.to_string())?;

        println!("✅ Página cargada: {}", url);

        Ok(html)
    })
    .await?;

    let document = Html::parse_document(&html);

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
