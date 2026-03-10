use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use tokio::time::{Duration, Instant};

#[derive(Deserialize, Clone, Debug)]
pub struct YoutubeInfoSelector {
	pub name: String,
	pub selector: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct YoutubeInfoResult {
	pub name: String,
	pub selector: String,
	#[serde(rename = "textContent")]
	pub text_content: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
pub struct YoutubeDetail {
	pub title: Option<String>,
	pub time: Option<String>,
}

async fn wait_retry_interval(interval_ms: u64) {
	let duration = Duration::from_millis(interval_ms.max(1));
	let mut ticker = tokio::time::interval_at(Instant::now() + duration, duration);
	ticker.tick().await;
}

async fn prepare_page_for_url(page: &chromiumoxide::Page, url: &str) -> Result<(), String> {
	page.goto(url)
		.await
		.map_err(|e| format!("Failed to navigate to page: {}", e))?;

	page.wait_for_navigation()
		.await
		.map_err(|e| format!("Failed to wait for navigation: {}", e))?;

	Ok(())
}

async fn extract_chapters_from_page(
	page: &chromiumoxide::Page,
	interval_ms: u64,
	attempts: u32,
) -> Result<Vec<YoutubeDetail>, String> {
	let expand_button_selector = "tp-yt-paper-button#expand";
	let click_script = format!(
		r#"(() => {{
			const el = document.querySelector('{}');
			if (el) {{
				el.click();
				return true;
			}}
			return false;
		}})()"#,
		expand_button_selector
	);

	let mut clicked = false;
	let mut click_error = String::from("Failed to find expand button element");
	for attempt in 1..=attempts {
		match page.evaluate(click_script.clone()).await {
			Ok(eval) => match eval.into_value::<bool>() {
				Ok(true) => {
					clicked = true;
					break;
				}
				Ok(false) => {
					click_error = "Failed to find expand button element".to_string();
				}
				Err(e) => {
					click_error = format!("Failed to parse click result: {}", e);
				}
			},
			Err(e) => {
				click_error = format!("Failed to evaluate click script: {}", e);
			}
		}

		if attempt < attempts {
			wait_retry_interval(interval_ms).await;
		}
	}
	if !clicked {
		return Err(click_error);
	}

	let script = r#"(() => {
		try {
			const details = document.querySelectorAll('div#details');
			const results = [];
			details.forEach(detail => {
				try {
					const h4 = detail.querySelector('h4');
					const timeDiv = detail.querySelector('div#time');
					const title = h4 ? (h4.textContent || '').trim() : null;
					const time = timeDiv ? (timeDiv.textContent || '').trim() : null;
					if (title || time) {
						results.push({ title, time });
					}
				} catch (e) {
					console.error('Error processing detail:', e);
				}
			});
			return results;
		} catch (e) {
			console.error('Error in details script:', e);
			return [];
		}
	})()"#;

	let mut details_data: Vec<Value> = Vec::new();
	let mut details_error = String::new();
	for attempt in 1..=attempts {
		match page.evaluate(script).await {
			Ok(eval) => match eval.into_value::<Vec<Value>>() {
				Ok(values) => {
					details_data = values;
					break;
				}
				Err(e) => {
					details_error = format!("Failed to parse JS result for details: {}", e);
				}
			},
			Err(e) => {
				details_error = format!("Failed to execute JS script for details: {}", e);
			}
		}

		if attempt < attempts {
			wait_retry_interval(interval_ms).await;
		}
	}
	if details_data.is_empty() && !details_error.is_empty() {
		return Err(details_error);
	}

	let mut seen = std::collections::HashSet::new();
	let mut chapters: Vec<YoutubeDetail> = details_data
		.into_iter()
		.map(|item| {
			let title = item.get("title").and_then(|v| v.as_str()).map(|s| s.to_string());
			let time = item.get("time").and_then(|v| v.as_str()).map(|s| s.to_string());
			YoutubeDetail { title, time }
		})
		.collect();

	chapters.retain(|detail| {
		let key = format!("{:?}{:?}", detail.title, detail.time);
		seen.insert(key)
	});

	println!("Details: {:?}", chapters);

	Ok(chapters)
}

#[tauri::command]
pub async fn extract_chapters(
	app: AppHandle,
	url: String,
	interval_ms: u64,
	attempts: u32,
) -> Result<Vec<YoutubeDetail>, String> {
	if attempts == 0 {
		return Err("attempts must be greater than 0".to_string());
	}

	app.emit(
		"flow-status",
		json!({"key": "youtube-chapters", "status": "Extracting chapters", "data": null}),
	)
	.map_err(|e| format!("Failed to emit flow-status event: {}", e))?;

	let chapters = crate::browser::with_ready_page(|page| async move {
		prepare_page_for_url(&page, &url).await?;
		extract_chapters_from_page(&page, interval_ms, attempts).await
	})
	.await?;

	app.emit(
		"flow-status",
		json!({"key": "youtube-chapters", "status": "done", "data": chapters}),
	)
	.map_err(|e| format!("Failed to emit flow-status event: {}", e))?;

	Ok(chapters)
}

#[tauri::command]
pub async fn get_youtube_info(
	app: AppHandle,
	url: String,
	selectors: Vec<YoutubeInfoSelector>,
	interval_ms: u64,
	attempts: u32,
) -> Result<Vec<YoutubeInfoResult>, String> {
	if attempts == 0 {
		return Err("attempts must be greater than 0".to_string());
	}

	app.emit(
		"flow-status",
		json!({"key": "youtube-info", "status": "Extracting selectors", "data": null}),
	)
	.map_err(|e| format!("Failed to emit flow-status event: {}", e))?;

	let results = crate::browser::with_ready_page(|page| async move {
		prepare_page_for_url(&page, &url).await?;

		let mut results: Vec<YoutubeInfoResult> = Vec::with_capacity(selectors.len());

		for item in selectors {
			let selector_escaped = item.selector.replace('\\', "\\\\").replace('\'', "\\'");
			let mut text_content: Option<String> = None;

			for attempt in 1..=attempts {
				let script = format!(
					r#"(() => {{
						const el = document.querySelector('{selector}');
						if (!el) return null;
						const txt = (el.textContent || '').trim();
						return txt.length ? txt : null;
					}})()"#,
					selector = selector_escaped
				);

				let maybe_text: Option<String> = page
					.evaluate(script)
					.await
					.map_err(|e| format!("Failed to execute JS script: {}", e))?
					.into_value()
					.map_err(|e| format!("Failed to parse JS result: {}", e))?;

				if let Some(value) = maybe_text {
					text_content = Some(value);
					break;
				}

				if attempt < attempts {
					wait_retry_interval(interval_ms).await;
				}
			}

			results.push(YoutubeInfoResult {
				name: item.name,
				selector: item.selector,
				text_content,
			});
		}

		Ok(results)
	})
	.await?;

	app.emit(
		"flow-status",
		json!({"key": "youtube-info", "status": "done", "data": results}),
	)
	.map_err(|e| format!("Failed to emit flow-status event: {}", e))?;

	Ok(results)
}
