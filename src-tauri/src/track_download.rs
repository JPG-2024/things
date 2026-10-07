use serde::Serialize;
use std::path::PathBuf;
use tauri::ipc::Channel;
use tauri::Manager;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "event", content = "data")]
pub enum TrackDownloadEvent {
    Downloading { url: String },
    TrackDone { url: String, filename: String },
    TrackError { url: String, message: String },
}

/// Picks the most relevant line(s) from yt-dlp stderr so the UI can show a real
/// cause instead of just the process exit code.
fn summarize_yt_dlp_error(stderr: &str) -> String {
    const MAX_LEN: usize = 500;

    let lines: Vec<&str> = stderr
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect();

    let error_lines: Vec<&str> = lines
        .iter()
        .copied()
        .filter(|line| line.contains("ERROR"))
        .collect();

    let summary = if !error_lines.is_empty() {
        error_lines.join(" | ")
    } else {
        lines
            .iter()
            .rev()
            .take(3)
            .copied()
            .collect::<Vec<_>>()
            .join(" | ")
    };

    if summary.len() > MAX_LEN {
        let mut end = MAX_LEN;
        while !summary.is_char_boundary(end) {
            end -= 1;
        }
        format!("{}…", &summary[..end])
    } else {
        summary
    }
}

#[tauri::command]
pub async fn download_track(
    app: tauri::AppHandle,
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

    let download_dir = if download_dir.trim().is_empty() {
        app.path()
            .download_dir()
            .map_err(|e| format!("Failed to resolve default download directory: {}", e))?
            .to_string_lossy()
            .into_owned()
    } else {
        download_dir
    };

    let output_dir = PathBuf::from(&download_dir).join(&folder_name);
    std::fs::create_dir_all(&output_dir).map_err(|e| {
        format!(
            "Failed to create output directory {}: {}",
            output_dir.display(),
            e
        )
    })?;

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
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                "yt-dlp is not installed or not found on PATH".to_string()
            } else {
                format!("Failed to start yt-dlp: {}", e)
            }
        })?;

    let stdout = child
        .stdout
        .take()
        .ok_or("Failed to capture yt-dlp stdout")?;
    let stderr = child
        .stderr
        .take()
        .ok_or("Failed to capture yt-dlp stderr")?;

    // Drain stderr concurrently: yt-dlp writes progress there and a full pipe
    // buffer would otherwise deadlock the child while we only read stdout.
    let stderr_task = tokio::spawn(async move {
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();
        let mut collected = String::new();
        while let Ok(Some(line)) = lines.next_line().await {
            if !collected.is_empty() {
                collected.push('\n');
            }
            collected.push_str(line.trim_end());
        }
        collected
    });

    let reader = BufReader::new(stdout);
    let mut lines = reader.lines();

    let mut filepath = String::new();

    while let Ok(Some(line)) = lines.next_line().await {
        let trimmed = line.trim().to_string();
        if !trimmed.is_empty() {
            filepath = trimmed;
        }
    }

    let stderr_output = stderr_task.await.unwrap_or_default();

    let status = child
        .wait()
        .await
        .map_err(|e| format!("yt-dlp process error: {}", e))?;

    if !status.success() {
        let code = status.code().unwrap_or(-1);
        let detail = summarize_yt_dlp_error(&stderr_output);
        let message = if detail.is_empty() {
            format!("yt-dlp exited with code {}", code)
        } else {
            format!("yt-dlp exited with code {}: {}", code, detail)
        };
        on_event
            .send(TrackDownloadEvent::TrackError {
                url: url.clone(),
                message: message.clone(),
            })
            .ok();
        return Err(message);
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
        .send(TrackDownloadEvent::TrackDone { url, filename })
        .ok();

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::summarize_yt_dlp_error;

    #[test]
    fn prefers_error_lines() {
        let stderr = "[youtube] Extracting URL\nERROR: Video unavailable\nSome progress\n";
        assert_eq!(summarize_yt_dlp_error(stderr), "ERROR: Video unavailable");
    }

    #[test]
    fn joins_multiple_error_lines_in_order() {
        let stderr = "ERROR: first\nnoise\nERROR: second\n";
        assert_eq!(
            summarize_yt_dlp_error(stderr),
            "ERROR: first | ERROR: second"
        );
    }

    #[test]
    fn falls_back_to_last_non_empty_lines() {
        let stderr = "line one\nline two\nline three\nline four\n";
        assert_eq!(
            summarize_yt_dlp_error(stderr),
            "line four | line three | line two"
        );
    }

    #[test]
    fn empty_stderr_yields_empty_summary() {
        assert_eq!(summarize_yt_dlp_error(""), "");
        assert_eq!(summarize_yt_dlp_error("\n\n   \n"), "");
    }

    #[test]
    fn truncates_long_output_on_char_boundary() {
        let stderr = format!("ERROR: {}", "á".repeat(400));
        let summary = summarize_yt_dlp_error(&stderr);
        assert!(summary.starts_with("ERROR: á"));
        assert!(summary.ends_with('…'));
        assert!(summary.len() <= 503);
    }
}
