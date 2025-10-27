use chromiumoxide::browser::{Browser, BrowserConfig};
use futures::StreamExt;
use anyhow::Result;
use tokio::sync::Mutex;
use std::sync::Arc;
use lazy_static::lazy_static;

use serde::Deserialize;

#[derive(Deserialize)]
struct AntiDetectConfig {
	user_agent: String,
	accept_language: String,
	platform: String,
	script: String,
}

lazy_static! {
	pub static ref BROWSER: Arc<Mutex<Option<Browser>>> = Arc::new(Mutex::new(None));
	pub static ref PAGE_CONFIGURED: Arc<Mutex<bool>> = Arc::new(Mutex::new(false));
}

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

/// Inicializa el browser globalmente si aún no está inicializado
pub async fn init_browser() -> Result<()> {
	let mut browser_lock = BROWSER.lock().await;
	if browser_lock.is_some() {
		return Ok(());
	}

	let args = load_browser_config()?;

	let config = BrowserConfig::builder()
		.disable_default_args()
		.args(args)
		.build()
		.map_err(|e| anyhow::anyhow!(e))?;

	let (mut browser, mut handler) = Browser::launch(config).await?;

	// Spawn handler to keep event loop alive
	tokio::spawn(async move {
		while let Some(h) = handler.next().await {
			if h.is_err() {
				break;
			}
		}
	});

	// Dejar el browser en el static
	*browser_lock = Some(browser);

	Ok(())
}

/// Persistir si el browser está listo (tauri command expuesto)
#[tauri::command]
pub async fn is_browser_ready() -> bool {
	let browser_lock = BROWSER.lock().await;
	browser_lock.is_some()
}

/// Configura una página con anti-detección y user agent
pub async fn configure_page(page: &chromiumoxide::Page) -> Result<()> {
	let config = load_antidetect_config()?;
	page.execute(chromiumoxide::cdp::browser_protocol::emulation::SetUserAgentOverrideParams {
		user_agent: config.user_agent,
		accept_language: Some(config.accept_language),
		platform: Some(config.platform),
		user_agent_metadata: None,
	})
	.await?;

	page.evaluate(config.script.as_str()).await?;

	Ok(())
}

/// Obtiene una página configurada y lista para usar
pub async fn get_ready_page() -> Result<chromiumoxide::Page> {
	init_browser().await?;

	let browser_lock = BROWSER.lock().await;
	let browser = browser_lock.as_ref().ok_or_else(|| anyhow::anyhow!("Browser not initialized"))?;

	let page = browser.new_page("about:blank").await?;
	drop(browser_lock);

	// Solo configurar la página una sola vez
	let mut page_configured = PAGE_CONFIGURED.lock().await;
	if !*page_configured {
		configure_page(&page).await?;
		*page_configured = true;
		println!("✅ Página configurada (primera vez)");
	}

	Ok(page)
}

