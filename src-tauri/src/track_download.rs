use serde::Serialize;
use std::path::PathBuf;
use tauri::ipc::Channel;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "event", content = "data")]
pub enum TrackDownloadEvent {
	Downloading { url: String },
	TrackDone { url: String, filename: String },
	TrackError { url: String, message: String },
}

#[tauri::command]
pub async fn download_track(
	url: String,
	download_dir: String,
	folder_name: String,
	on_event: Channel<TrackDownloadEvent>,
) -> Result<(), String> {
	if url.is_empty() {
		return Err("URL is empty".into());
	}

	on_event
		.send(TrackDownloadEvent::Downloading { url: url.clone() })
		.ok();

	let output_dir = PathBuf::from(&download_dir).join(&folder_name);
	std::fs::create_dir_all(&output_dir)
		.map_err(|e| format!("Failed to create output directory: {}", e))?;

	let output_template = output_dir.join("%(title)s.%(ext)s");

	let mut child = Command::new("yt-dlp")
		.arg("--impersonate")
		.arg("chrome")
		.arg("-f")
		.arg("bestaudio")
		.arg("-x")
		.arg("--audio-format")
		.arg("mp3")
		.arg("--audio-quality")
		.arg("0")
		.arg("--embed-thumbnail")
		.arg("--embed-metadata")
		.arg("--print")
		.arg("after_move:filepath")
		.arg("-o")
		.arg(output_template.to_string_lossy().as_ref())
		.arg(&url)
		.stdout(std::process::Stdio::piped())
		.stderr(std::process::Stdio::null())
		.spawn()
		.map_err(|e| {
			if e.kind() == std::io::ErrorKind::NotFound {
				"yt-dlp is not installed or not found on PATH".to_string()
			} else {
				format!("Failed to start yt-dlp: {}", e)
			}
		})?;

	let stdout = child.stdout.take().ok_or("Failed to capture yt-dlp stdout")?;
	let reader = BufReader::new(stdout);
	let mut lines = reader.lines();

	let mut filepath = String::new();

	while let Ok(Some(line)) = lines.next_line().await {
		let trimmed = line.trim().to_string();
		if !trimmed.is_empty() {
			filepath = trimmed;
		}
	}

	let status = child
		.wait()
		.await
		.map_err(|e| format!("yt-dlp process error: {}", e))?;

	if !status.success() {
		let code = status.code().unwrap_or(-1);
		on_event
			.send(TrackDownloadEvent::TrackError {
				url: url.clone(),
				message: format!("yt-dlp exited with code {}", code),
			})
			.ok();
		return Err(format!("yt-dlp exited with code {}", code));
	}

	if filepath.is_empty() {
		on_event
			.send(TrackDownloadEvent::TrackError {
				url: url.clone(),
				message: "yt-dlp did not return a filepath".into(),
			})
			.ok();
		return Err("yt-dlp did not return a filepath".into());
	}

	let filename = PathBuf::from(&filepath)
		.file_name()
		.map(|n| n.to_string_lossy().into_owned())
		.unwrap_or_default();

	on_event
		.send(TrackDownloadEvent::TrackDone {
			url,
			filename,
		})
		.ok();

	Ok(())
}
