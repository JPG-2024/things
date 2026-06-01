use anyhow::Result;
use chromiumoxide::browser::{Browser, BrowserConfig};
use futures_util::StreamExt;
use scraper::Html;
use serde::Deserialize;
use serde_json::json;
use std::future::Future;
use std::sync::Arc;
use std::sync::LazyLock;
use tauri::{AppHandle, Emitter};
use tokio::sync::{Mutex, OwnedSemaphorePermit, Semaphore};
use tokio::task::JoinHandle;
use tokio::time::Duration;

const MAX_CONCURRENT_PAGES: usize = 2;
pub const PAGE_OP_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Deserialize)]
struct AntiDetectConfig {
    user_agent: String,
    accept_language: String,
    platform: String,
    script: String,
}

static ANTI_DETECT_CONFIG: LazyLock<AntiDetectConfig> = LazyLock::new(|| {
    serde_json::from_str(include_str!("../antidetect.json"))
        .expect("Failed to load antidetect.json")
});

struct BrowserState {
    browser: Arc<Mutex<Browser>>,
    handler_task: JoinHandle<()>,
    page_semaphore: Arc<Semaphore>,
    shared_page: Arc<Mutex<Option<chromiumoxide::Page>>>,
    user_data_dir: String,
    cleanup_on_exit: bool,
}

#[derive(Clone)]
struct BrowserContext {
    browser: Arc<Mutex<Browser>>,
    page_semaphore: Arc<Semaphore>,
    shared_page: Arc<Mutex<Option<chromiumoxide::Page>>>,
    user_data_dir: String,
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

// Anti-detect config se carga estáticamente en ANTI_DETECT_CONFIG (LazyLock)

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
fn resolve_user_data_dir() -> Result<(String, bool), String> {
    if let Ok(custom_dir) = std::env::var("BROWSER_USER_DATA_DIR") {
        let path = std::path::Path::new(&custom_dir);
        if !path.exists() {
            std::fs::create_dir_all(&custom_dir)
                .map_err(|e| format!("Failed to create custom user data dir '{}': {}", custom_dir, e))?;
        }
        println!("📁 Using custom browser profile: {}", custom_dir);
        Ok((custom_dir, false))
    } else {
        let temp_dir = format!(
            "/tmp/chromium-profile-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|duration| duration.as_millis())
                .unwrap_or_default()
        );
        std::fs::create_dir_all(&temp_dir)
            .map_err(|e| format!("Failed to create temp user data dir: {}", e))?;
        Ok((temp_dir, true))
    }
}

fn check_profile_lock(user_data_dir: &str) {
    let lock_files = ["SingletonLock", "lockfile", "SingletonCookie", "SingletonSocket"];
    for lock_name in lock_files {
        let lock_path = std::path::Path::new(user_data_dir).join(lock_name);
        if lock_path.exists() {
            if let Err(e) = std::fs::remove_file(&lock_path) {
                if let Ok(content) = std::fs::read_to_string(&lock_path) {
                    println!("⚠️  Browser profile lock detected: {} (content: {})", lock_path.display(), content.trim());
                } else {
                    println!("⚠️  Browser profile lock detected: {}", lock_path.display());
                }
                eprintln!("⚠️  Failed to remove stale lock: {}", e);
            } else {
                println!("🧹 Removed stale lock: {}", lock_path.display());
            }
        }
    }
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

    let headless = std::env::var("BROWSER_HEADLESS")
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(true);

    if !headless {
        config = config.with_head();
    }
    println!("🖥️  Browser mode: {}", if headless { "headless" } else { "visible" });

    let (user_data_dir, cleanup_on_exit) = resolve_user_data_dir()?;
    if !cleanup_on_exit {
        check_profile_lock(&user_data_dir);
    }

    config = config
        .user_data_dir(&user_data_dir)
        .no_sandbox()
        .arg("--no-first-run")
        .arg("--no-default-browser-check")
        .arg("--disable-sync")
        .arg("--disable-features=WebRTC,MediaStream")
        .arg("--use-fake-ui-for-media-stream")
        .arg("--disable-media-session-api");

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
        shared_page: Arc::new(Mutex::new(None)),
        user_data_dir,
        cleanup_on_exit,
    })
}

async fn ensure_browser() -> Result<BrowserContext, String> {
    let mut state = BROWSER_STATE.lock().await;

    if state.is_none() {
        *state = Some(launch_browser_state().await?);
    }

    let state = state
        .as_ref()
        .ok_or_else(|| "Browser state is unavailable".to_string())?;

    Ok(BrowserContext {
        browser: state.browser.clone(),
        page_semaphore: state.page_semaphore.clone(),
        shared_page: state.shared_page.clone(),
        user_data_dir: state.user_data_dir.clone(),
    })
}

/// Inicializa el browser globalmente si aún no está inicializado
#[tauri::command]
pub async fn init_browser() -> Result<(), String> {
    let ctx = ensure_browser().await?;
    println!("📂 Browser profile loaded: {}", ctx.user_data_dir);
    Ok(())
}

/// Retorna la ruta del perfil del navegador actualmente en uso
#[tauri::command]
pub async fn get_browser_profile() -> Result<String, String> {
    let ctx = ensure_browser().await?;
    Ok(ctx.user_data_dir)
}

pub async fn shutdown_browser() -> Result<(), String> {
    let state = {
        let mut state = BROWSER_STATE.lock().await;
        state.take()
    };

    if let Some(state) = state {
        if let Some(shared_page) = state.shared_page.lock().await.take() {
            if let Err(error) = shared_page.close().await {
                eprintln!("Failed to close shared page: {}", error);
            }
        }

        if let Err(error) = state.browser.lock().await.close().await {
            eprintln!("Failed to close browser: {}", error);
        }

        state.handler_task.abort();
        if state.cleanup_on_exit {
            cleanup_user_data_dir(&state.user_data_dir);
        }
    }

    Ok(())
}

/// Configura una página con anti-detección y user agent
pub async fn configure_page(page: &chromiumoxide::Page) -> Result<()> {
    let config = &ANTI_DETECT_CONFIG;
    page.execute(
        chromiumoxide::cdp::browser_protocol::emulation::SetUserAgentOverrideParams {
            user_agent: config.user_agent.clone(),
            accept_language: Some(config.accept_language.clone()),
            platform: Some(config.platform.clone()),
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
}

pub async fn with_shared_page<T, F, Fut>(work: F) -> Result<T, String>
where
    F: FnOnce(chromiumoxide::Page) -> Fut,
    Fut: Future<Output = Result<T, String>>,
    T: Send + 'static,
{
    let ctx = ensure_browser().await?;

    let page = {
        let mut guard = ctx.shared_page.lock().await;
        if guard.is_none() {
            let new_page = ctx.browser.lock().await.new_page("about:blank").await.map_err(|e| e.to_string())?;
            configure_page(&new_page).await.map_err(|e| e.to_string())?;
            *guard = Some(new_page);
        }
        guard.as_ref().unwrap().clone()
    };

    let result = work(page).await;

    if result.is_err() {
        let mut guard = ctx.shared_page.lock().await;
        if let Some(p) = guard.take() {
            close_page(p).await;
        }
    }

    result
}

pub async fn with_ready_page<T, F, Fut>(work: F, close_page: bool) -> Result<T, String>
where
    F: FnOnce(chromiumoxide::Page) -> Fut,
    Fut: Future<Output = Result<T, String>>,
{
	let page = get_ready_page()
		.await
		.map_err(|e| format!("Failed to get browser page: {}", e))?;

	let result = work(page.page.clone()).await;
	if close_page {
		close_ready_page(page).await;
	}

	result
}

/// Navega a una URL y retorna el HTML y documento parseado
pub async fn get_document(app: AppHandle, url: String, close_page: bool) -> Result<(String, Html), String> {
    app.emit(
        "flow-status",
        json!({"key": "page", "status": "Loading Page", "data": null}),
    ).map_err(|e| e.to_string())?;

    let html = with_ready_page(|page| async move {
        tokio::time::timeout(PAGE_OP_TIMEOUT, page.goto(&url))
            .await
            .map_err(|_| "Page navigation timed out".to_string())?
            .map_err(|e| e.to_string())?;

        let html: String = tokio::time::timeout(PAGE_OP_TIMEOUT, page.content())
            .await
            .map_err(|_| "Page content extraction timed out".to_string())?
            .map_err(|e| e.to_string())?;

        println!("✅ Página cargada: {}", url);

        Ok(html)
    }, close_page)
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
