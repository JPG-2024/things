use anyhow::Result;
use htmd::HtmlToMarkdown;
use reqwest::Client;
use scraper::{Html, Selector};
use serde::Serialize;
use serde_json::json;
use std::collections::HashMap;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

fn build_http_client() -> Result<Client, String> {
	Client::builder()
		.timeout(REQUEST_TIMEOUT)
		.user_agent(
			"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
		)
		.default_headers({
			let mut headers = reqwest::header::HeaderMap::new();
			headers.insert(
				reqwest::header::ACCEPT,
				"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
					.parse()
					.unwrap(),
			);
			headers.insert(
				reqwest::header::ACCEPT_LANGUAGE,
				"es-ES,es;q=0.9,en;q=0.8".parse().unwrap(),
			);
			headers
		})
		.build()
		.map_err(|e| format!("Failed to build HTTP client: {}", e))
}

async fn fetch_html(url: &str) -> Result<String, String> {
	let client = build_http_client()?;
	client
		.get(url)
		.send()
		.await
		.map_err(|e| format!("Failed to fetch page: {}", e))?
		.text()
		.await
		.map_err(|e| format!("Failed to read page content: {}", e))
}

#[tauri::command]
pub async fn extract_metadata(
	app: AppHandle,
	url: String,
) -> Result<HashMap<String, String>, String> {
	app.emit(
		"flow-status",
		json!({"key": "page", "status": "Loading Page", "data": null}),
	)
	.map_err(|e| e.to_string())?;

	let html = fetch_html(&url).await?;
	let document = Html::parse_document(&html);
	let metadata = extract_metadata_from_document(&app, &document)?;

	app.emit(
		"flow-status",
		json!({"key": "page", "status": "done", "data": null}),
	)
	.map_err(|e| e.to_string())?;

	Ok(metadata)
}

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

#[tauri::command]
pub async fn extract_markdown(
	app: AppHandle,
	url: String,
	selectors: Vec<String>,
) -> Result<String, String> {
	app.emit(
		"flow-status",
		json!({"key": "page", "status": "Loading Page", "data": null}),
	)
	.map_err(|e| e.to_string())?;

	let html = fetch_html(&url).await?;
	let document = Html::parse_document(&html);
	let markdown = extract_markdown_from_html(&app, &html, &document, selectors)?;

	app.emit(
		"flow-status",
		json!({"key": "page", "status": "done", "data": null}),
	)
	.map_err(|e| e.to_string())?;

	Ok(markdown)
}

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

#[derive(Serialize)]
pub struct BlogContent {
	pub metadata: HashMap<String, String>,
	pub markdown: String,
}

#[tauri::command]
pub async fn extract_blog(
	app: AppHandle,
	url: String,
	selectors: Vec<String>,
) -> Result<BlogContent, String> {
	app.emit(
		"flow-status",
		json!({"key": "page", "status": "Loading Page", "data": null}),
	)
	.map_err(|e| e.to_string())?;

	let html = fetch_html(&url).await?;

	println!("✅ Página cargada: {}", url);

	app.emit(
		"flow-status",
		json!({"key": "page", "status": "done", "data": null}),
	)
	.map_err(|e| e.to_string())?;

	let document = Html::parse_document(&html);

	let metadata = extract_metadata_from_document(&app, &document)?;

	app.emit(
		"flow-status",
		json!({"key": "metadata", "status": "done", "data": metadata.clone()}),
	)
	.map_err(|e| format!("Failed to emit flow-status event: {}", e))?;

	let markdown = extract_markdown_from_html(&app, &html, &document, selectors)?;

	println!("<< ✅ Blog extraído completamente >>");
	println!("Metadatos extraídos: {} elementos", markdown);

	Ok(BlogContent { metadata, markdown })
}
