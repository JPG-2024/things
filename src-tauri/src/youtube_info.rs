use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use std::collections::HashSet;
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

async fn wait_retry_interval(interval_time: u64) {
	let duration = Duration::from_millis(interval_time.max(1));
	let mut ticker = tokio::time::interval_at(Instant::now() + duration, duration);
	ticker.tick().await;
}

#[tauri::command]
pub async fn get_youtube_info(
	app: AppHandle,
	url: String,
	selectors: Vec<YoutubeInfoSelector>,
	interval_time: u64,
	max_attempts: u32,
) -> Result<(Vec<YoutubeInfoResult>, Vec<YoutubeDetail>), String> {
	if max_attempts == 0 {
		return Err("max_attempts must be greater than 0".to_string());
	}

	app.emit(
		"flow-status",
		json!({"key": "youtube-info", "status": "Extracting selectors", "data": null}),
	)
	.map_err(|e| format!("Failed to emit flow-status event: {}", e))?;

	let page = crate::browser::get_ready_page()
		.await
		.map_err(|e| format!("Failed to get browser page: {}", e))?;

	page.goto(&url)
		.await
		.map_err(|e| format!("Failed to navigate to page: {}", e))?;

	page.wait_for_navigation()
		.await
		.map_err(|e| format!("Failed to wait for navigation: {}", e))?;

	// click element "tp-yt-paper-button" with id "expand"
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
	for attempt in 1..=max_attempts {
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

		if attempt < max_attempts {
			wait_retry_interval(interval_time).await;
		}
	}
	if !clicked {
		return Err(click_error);
	}

	// get details (title and time) from each div#details
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
	for attempt in 1..=max_attempts {
		match page.evaluate(script).await {
			Ok(eval) => match eval.into_value::<Vec<Value>>() {
				Ok(v) => {
					details_data = v;
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

		if attempt < max_attempts {
			wait_retry_interval(interval_time).await;
		}
	}
	if details_data.is_empty() && !details_error.is_empty() {
		return Err(details_error);
	}

	// Remove duplicates while preserving order
	let mut seen = std::collections::HashSet::new();
	let mut time_texts: Vec<YoutubeDetail> = details_data
		.into_iter()
		.filter_map(|item| {
			let title = item.get("title").and_then(|v| v.as_str()).map(|s| s.to_string());
			let time = item.get("time").and_then(|v| v.as_str()).map(|s| s.to_string());
			Some(YoutubeDetail { title, time })
		})
		.collect();

	// Remove duplicates while preserving order
	time_texts.retain(|detail| {
		let key = format!("{:?}{:?}", detail.title, detail.time);
		seen.insert(key)
	});

	println!("Details: {:?}", time_texts);

	let mut results: Vec<YoutubeInfoResult> = Vec::with_capacity(selectors.len());

	for item in selectors {
		let selector_escaped = item.selector.replace('\\', "\\\\").replace('\'', "\\'");
		let mut text_content: Option<String> = None;

		for attempt in 1..=max_attempts {
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

			if attempt < max_attempts {
				wait_retry_interval(interval_time).await;
			}
		}

		results.push(YoutubeInfoResult {
			name: item.name,
			selector: item.selector,
			text_content,
		});
	}

	app.emit(
		"flow-status",
		json!({"key": "youtube-info", "status": "done", "data": {"results": results, "time_texts": time_texts}}),
	)
	.map_err(|e| format!("Failed to emit flow-status event: {}", e))?;

	Ok((results, time_texts))
}
