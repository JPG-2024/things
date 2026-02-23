use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use std::collections::HashSet;

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

#[tauri::command]
pub async fn get_youtube_info(
	app: AppHandle,
	url: String,
	selectors: Vec<YoutubeInfoSelector>,
) -> Result<(Vec<YoutubeInfoResult>, Vec<YoutubeDetail>), String> {
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

    // Wait for the page to load
    tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;

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
	let clicked: bool = page
		.evaluate(click_script)
		.await
		.map_err(|e| format!("Failed to evaluate click script: {}", e))?
		.into_value()
		.map_err(|e| format!("Failed to parse click result: {}", e))?;
	if !clicked {
		return Err("Failed to find expand button element".to_string());
	}
	tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;

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

	let details_data: Vec<Value> = page
		.evaluate(script)
		.await
		.map_err(|e| format!("Failed to execute JS script for details: {}", e))?
		.into_value()
		.map_err(|e| format!("Failed to parse JS result for details: {}", e))?;

	let mut time_texts: Vec<YoutubeDetail> = details_data
		.into_iter()
		.filter_map(|item| {
			let title = item.get("title").and_then(|v| v.as_str()).map(|s| s.to_string());
			let time = item.get("time").and_then(|v| v.as_str()).map(|s| s.to_string());
			Some(YoutubeDetail { title, time })
		})
		.collect();

	// Remove duplicates while preserving order
	let mut seen = std::collections::HashSet::new();
	time_texts.retain(|detail| {
		let key = format!("{:?}{:?}", detail.title, detail.time);
		seen.insert(key)
	});

	println!("Details: {:?}", time_texts);

	let mut results: Vec<YoutubeInfoResult> = Vec::with_capacity(selectors.len());

	for item in selectors {
		let selector_escaped = item.selector.replace('\\', "\\\\").replace('\'', "\\'");
		let mut text_content: Option<String> = None;

		for _ in 0..50 {
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

			tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
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
