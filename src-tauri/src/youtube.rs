use quick_xml::events::Event;
use quick_xml::Reader;
use regex::Regex;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Emitter};
use url::Url;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CaptionEntry {
	pub caption: String,
	pub start_time: f64,
	pub end_time: f64,
}

fn strip_fmt_param(base_url: &str) -> String {
	if let Ok(mut url) = Url::parse(base_url) {
		let pairs: Vec<(String, String)> = url
			.query_pairs()
			.map(|(k, v)| (k.into_owned(), v.into_owned()))
			.collect();

		let mut serializer = url::form_urlencoded::Serializer::new(String::new());
		for (key, value) in pairs {
			if key != "fmt" {
				serializer.append_pair(&key, &value);
			}
		}

		let new_query = serializer.finish();
		if new_query.is_empty() {
			url.set_query(None);
		} else {
			url.set_query(Some(&new_query));
		}

		return url.to_string();
	}

	base_url.to_string()
}

async fn fetch_timed_transcript(id: &str, language: &str) -> Result<Vec<CaptionEntry>, String> {
	let client = Client::new();
	let video_url = format!("https://www.youtube.com/watch?v={}", id);

	let html = client
		.get(&video_url)
		.header(
			"User-Agent",
			"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
		)
		.send()
		.await
		.map_err(|e| format!("Failed to fetch video page: {}", e))?
		.text()
		.await
		.map_err(|e| format!("Failed to read video page HTML: {}", e))?;

	let api_key_re = Regex::new(r#"INNERTUBE_API_KEY\":\"([^\"]+)\""#)
		.map_err(|e| format!("Failed to build API key regex: {}", e))?;
	let api_key = api_key_re
		.captures(&html)
		.and_then(|caps| caps.get(1).map(|m| m.as_str().to_string()))
		.ok_or_else(|| "INNERTUBE_API_KEY not found".to_string())?;

	let player_data = client
		.post(format!(
			"https://www.youtube.com/youtubei/v1/player?key={}",
			api_key
		))
		.header("Content-Type", "application/json")
		.json(&json!({
			"context": {
				"client": {
					"clientName": "ANDROID",
					"clientVersion": "20.10.38"
				}
			},
			"videoId": id
		}))
		.send()
		.await
		.map_err(|e| format!("Failed to fetch player data: {}", e))?
		.json::<serde_json::Value>()
		.await
		.map_err(|e| format!("Failed to parse player data: {}", e))?;

	let tracks = player_data
		.pointer("/captions/playerCaptionsTracklistRenderer/captionTracks")
		.and_then(|v| v.as_array())
		.ok_or_else(|| "No captions found".to_string())?;

	let track = tracks
		.iter()
		.find(|t| t.get("languageCode").and_then(|v| v.as_str()) == Some(language))
		.ok_or_else(|| format!("No captions for language: {}", language))?;

	let base_url = track
		.get("baseUrl")
		.and_then(|v| v.as_str())
		.ok_or_else(|| "Caption track baseUrl missing".to_string())?;

	let transcript_url = strip_fmt_param(base_url);
	let xml = client
		.get(&transcript_url)
		.send()
		.await
		.map_err(|e| format!("Failed to fetch transcript XML: {}", e))?
		.text()
		.await
		.map_err(|e| format!("Failed to read transcript XML: {}", e))?;

	let mut reader = Reader::from_str(&xml);
	reader.trim_text(true);

	let mut buf = Vec::new();
	let mut entries: Vec<CaptionEntry> = Vec::new();
	let mut current_start: Option<f64> = None;
	let mut current_dur: Option<f64> = None;
	let mut current_text = String::new();

	loop {
		match reader.read_event_into(&mut buf) {
			Ok(Event::Start(e)) if e.name().as_ref() == b"text" => {
				current_start = None;
				current_dur = None;
				current_text.clear();

				for attr in e.attributes().flatten() {
					let key = attr.key.as_ref();
					let value = attr
						.unescape_value()
						.map_err(|e| format!("Failed to unescape attribute: {}", e))?
						.to_string();

					if key == b"start" {
						current_start = value.parse::<f64>().ok();
					} else if key == b"dur" {
						current_dur = value.parse::<f64>().ok();
					}
				}
			}
			Ok(Event::Text(e)) => {
				current_text = e
					.unescape()
					.map_err(|e| format!("Failed to unescape text: {}", e))?
					.to_string();
			}
			Ok(Event::CData(e)) => {
				current_text = String::from_utf8_lossy(e.as_ref()).to_string();
			}
			Ok(Event::End(e)) if e.name().as_ref() == b"text" => {
				if let (Some(start), Some(dur)) = (current_start, current_dur) {
					entries.push(CaptionEntry {
						caption: current_text.clone(),
						start_time: start,
						end_time: start + dur,
					});
				}
			}
			Ok(Event::Eof) => break,
			Err(e) => return Err(format!("Failed to parse transcript XML: {}", e)),
			_ => {}
		}

		buf.clear();
	}

	Ok(entries)
}

#[tauri::command]
pub async fn get_youtube_transcript_timed(
	app: AppHandle,
	id: String,
	_language: Option<String>,
) -> Result<Vec<CaptionEntry>, String> {
	app.emit(
		"flow-status",
		json!({"key": "transcript", "status": "Extracting timed transcript", "data": null}),
	)
	.map_err(|e| format!("Failed to emit flow-status event: {}", e))?;

	let entries = match fetch_timed_transcript(&id, "en").await {
		Ok(entries) => entries,
		Err(_) => fetch_timed_transcript(&id, "es").await?,
	};

	app.emit(
		"flow-status",
		json!({"key": "transcript", "status": "done", "data": null}),
	)
	.map_err(|e| format!("Failed to emit flow-status event: {}", e))?;

	Ok(entries)
}

#[tauri::command]
pub async fn get_youtube_transcript_timed_text(
	app: AppHandle,
	id: String,
	_language: Option<String>,
) -> Result<String, String> {
	app.emit(
		"flow-status",
		json!({"key": "transcript", "status": "Extracting transcript", "data": null}),
	)
	.map_err(|e| format!("Failed to emit flow-status event: {}", e))?;

	let entries = match fetch_timed_transcript(&id, "en").await {
		Ok(entries) => entries,
		Err(_) => fetch_timed_transcript(&id, "es").await?,
	};
	let transcript_text = entries
		.iter()
		.map(|entry| entry.caption.trim())
		.filter(|text| !text.is_empty())
		.collect::<Vec<&str>>()
		.join(" ");

	app.emit(
		"flow-status",
		json!({"key": "transcript", "status": "done", "data": null}),
	)
	.map_err(|e| format!("Failed to emit flow-status event: {}", e))?;

	Ok(transcript_text)
}
