use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Emitter};

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

#[tauri::command]
pub async fn get_youtube_info(
	app: AppHandle,
	url: String,
	selectors: Vec<YoutubeInfoSelector>,
	interval_time: u64,
	max_attempts: u32,
) -> Result<Vec<YoutubeInfoResult>, String> {
	app.emit(
		"flow-status",
		json!({"key": "youtube-info", "status": "Extracting selectors", "data": null}),
	)
	.map_err(|e| format!("Failed to emit flow-status event: {}", e))?;

	let results = crate::browser::with_ready_page(|page| async move {
		page.goto(&url)
			.await
			.map_err(|e| format!("Failed to navigate to page: {}", e))?;

		page.wait_for_navigation()
			.await
			.map_err(|e| format!("Failed to wait for navigation: {}", e))?;

		let mut results: Vec<YoutubeInfoResult> = Vec::with_capacity(selectors.len());

		for item in selectors {
			let selector_escaped = item.selector.replace('\\', "\\\\").replace('\'', "\\'");
			let mut text_content: Option<String> = None;

			for _ in 0..max_attempts {
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

				tokio::time::sleep(tokio::time::Duration::from_millis(interval_time)).await;
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
