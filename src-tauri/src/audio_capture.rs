use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::ipc::Response;
use tauri::State;
use tokio::io::AsyncReadExt;
use tokio::process::{Child, Command};
use tokio::task::JoinHandle;

const RECORD_RATE: u32 = 48_000;
const RECORD_CHANNELS: u16 = 2;
const SETTLE_MS: u64 = 400;
const STDERR_TAIL_BYTES: usize = 4 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Recorder {
    PwRecord,
    Parec,
    Ffmpeg,
}

impl Recorder {
    fn binary(self) -> &'static str {
        match self {
            Recorder::PwRecord => "pw-record",
            Recorder::Parec => "parec",
            Recorder::Ffmpeg => "ffmpeg",
        }
    }
}

struct RecordingHandle {
    child: Child,
    path: PathBuf,
    recorder: Recorder,
    stderr: Arc<Mutex<Vec<u8>>>,
    stderr_task: Option<JoinHandle<()>>,
}

#[derive(Default)]
pub struct AudioRecorderState(Mutex<Option<RecordingHandle>>);

fn binary_available(binary: &str) -> bool {
    std::env::var_os("PATH")
        .map(|paths| std::env::split_paths(&paths).any(|dir| dir.join(binary).is_file()))
        .unwrap_or(false)
}

fn pick_recorder() -> Result<Recorder, String> {
    for candidate in [Recorder::PwRecord, Recorder::Parec, Recorder::Ffmpeg] {
        if binary_available(candidate.binary()) {
            return Ok(candidate);
        }
    }

    Err("No system audio recorder found. Install PipeWire (pw-record), PulseAudio (parec) or ffmpeg."
		.to_string())
}

/// Returns the monitor source of the default output sink, e.g. `alsa_output.pci-...hdmi-stereo.monitor`.
async fn default_sink_monitor() -> Result<String, String> {
    let output = Command::new("pactl")
        .arg("get-default-sink")
        .output()
        .await
        .map_err(|error| format!("Failed to run pactl: {}", error))?;

    if !output.status.success() {
        return Err("pactl could not report the default audio sink".to_string());
    }

    let sink = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if sink.is_empty() {
        return Err("No default audio sink available to record from".to_string());
    }

    Ok(format!("{}.monitor", sink))
}

fn spawn_stderr_drain(child: &mut Child) -> (Arc<Mutex<Vec<u8>>>, Option<JoinHandle<()>>) {
    let buffer = Arc::new(Mutex::new(Vec::<u8>::new()));

    let Some(mut stderr) = child.stderr.take() else {
        return (buffer, None);
    };

    let sink = Arc::clone(&buffer);
    let task = tokio::spawn(async move {
        let mut chunk = [0u8; 1024];
        loop {
            match stderr.read(&mut chunk).await {
                Ok(0) | Err(_) => break,
                Ok(read) => {
                    if let Ok(mut guard) = sink.lock() {
                        guard.extend_from_slice(&chunk[..read]);
                        if guard.len() > STDERR_TAIL_BYTES {
                            let excess = guard.len() - STDERR_TAIL_BYTES;
                            guard.drain(..excess);
                        }
                    }
                }
            }
        }
    });

    (buffer, Some(task))
}

fn stderr_tail(buffer: &Arc<Mutex<Vec<u8>>>) -> String {
    buffer
        .lock()
        .map(|guard| String::from_utf8_lossy(&guard).trim().to_string())
        .unwrap_or_default()
}

fn cleanup(handle: &mut RecordingHandle) {
    if let Some(task) = handle.stderr_task.take() {
        task.abort();
    }
    let _ = std::fs::remove_file(&handle.path);
}

#[tauri::command]
pub async fn start_system_audio_recording(
    state: State<'_, AudioRecorderState>,
) -> Result<(), String> {
    if !cfg!(target_os = "linux") {
        return Err("System audio capture is only supported on Linux".to_string());
    }

    {
        let guard = state
            .0
            .lock()
            .map_err(|_| "Recorder state poisoned".to_string())?;
        if guard.is_some() {
            return Err("A recording is already in progress".to_string());
        }
    }

    let recorder = pick_recorder()?;
    let path = std::env::temp_dir().join(format!("things-rec-{}.wav", uuid::Uuid::new_v4()));

    let mut command = Command::new(recorder.binary());
    match recorder {
        Recorder::PwRecord => {
            // Without `stream.capture.sink`, pw-record ignores the sink target and falls
            // back to the default source (the microphone), which records room noise.
            command
                .arg("-P")
                .arg("{ stream.capture.sink = true }")
                .arg("--target")
                .arg("@DEFAULT_AUDIO_SINK@")
                .arg("--rate")
                .arg(RECORD_RATE.to_string())
                .arg("--channels")
                .arg(RECORD_CHANNELS.to_string())
                .arg("--format")
                .arg("s16")
                .arg(&path);
        }
        Recorder::Parec => {
            let monitor = default_sink_monitor().await?;
            command
                .arg("--device")
                .arg(monitor)
                .arg("--file-format=wav")
                .arg("--format=s16le")
                .arg("--rate")
                .arg(RECORD_RATE.to_string())
                .arg("--channels")
                .arg(RECORD_CHANNELS.to_string())
                .arg(&path);
        }
        Recorder::Ffmpeg => {
            let monitor = default_sink_monitor().await?;
            command
                .arg("-f")
                .arg("pulse")
                .arg("-i")
                .arg(monitor)
                .arg("-ac")
                .arg(RECORD_CHANNELS.to_string())
                .arg("-ar")
                .arg(RECORD_RATE.to_string())
                .arg("-y")
                .arg(&path);
        }
    }

    let mut child = command
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped())
        .stdin(std::process::Stdio::null())
        .spawn()
        .map_err(|error| format!("Failed to start {}: {}", recorder.binary(), error))?;

    let (stderr, stderr_task) = spawn_stderr_drain(&mut child);

    {
        let mut guard = state
            .0
            .lock()
            .map_err(|_| "Recorder state poisoned".to_string())?;
        *guard = Some(RecordingHandle {
            child,
            path: path.clone(),
            recorder,
            stderr,
            stderr_task,
        });
    }

    // Give the recorder a moment to fail fast (bad target, busy device, ...).
    tokio::time::sleep(Duration::from_millis(SETTLE_MS)).await;

    let mut guard = state
        .0
        .lock()
        .map_err(|_| "Recorder state poisoned".to_string())?;
    let exited = match guard.as_mut() {
        Some(handle) => handle
            .child
            .try_wait()
            .map_err(|error| format!("Failed to inspect recorder process: {}", error))?,
        None => None,
    };

    if let Some(status) = exited {
        if let Some(mut handle) = guard.take() {
            let tail = stderr_tail(&handle.stderr);
            cleanup(&mut handle);
            let detail = if tail.is_empty() {
                format!(
                    "{} exited immediately ({})",
                    handle.recorder.binary(),
                    status
                )
            } else {
                format!(
                    "{} exited immediately ({}) {}",
                    handle.recorder.binary(),
                    status,
                    tail
                )
            };
            return Err(detail);
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn stop_system_audio_recording(
    state: State<'_, AudioRecorderState>,
) -> Result<Response, String> {
    let mut handle = {
        let mut guard = state
            .0
            .lock()
            .map_err(|_| "Recorder state poisoned".to_string())?;
        guard
            .take()
            .ok_or_else(|| "No recording in progress".to_string())?
    };

    // SIGINT lets the recorder finalize the WAV header instead of truncating it.
    #[cfg(unix)]
    if let Some(pid) = handle.child.id() {
        unsafe {
            libc::kill(pid as i32, libc::SIGINT);
        }
    }

    let timed_out = tokio::time::timeout(Duration::from_secs(3), handle.child.wait())
        .await
        .is_err();

    if timed_out {
        let _ = handle.child.start_kill();
        let _ = handle.child.wait().await;
    }

    if let Some(task) = handle.stderr_task.take() {
        task.abort();
    }

    let bytes = std::fs::read(&handle.path).map_err(|error| {
        let tail = stderr_tail(&handle.stderr);
        let _ = std::fs::remove_file(&handle.path);
        format!(
            "Failed to read recording{}: {}",
            if tail.is_empty() {
                String::new()
            } else {
                format!(" ({})", tail)
            },
            error
        )
    })?;

    let _ = std::fs::remove_file(&handle.path);

    if timed_out {
        return Err(format!(
            "{} did not stop in time and the recording may be incomplete",
            handle.recorder.binary()
        ));
    }

    // A bare WAV header is 44 bytes; anything smaller means nothing was captured.
    if bytes.len() <= 44 {
        let tail = stderr_tail(&handle.stderr);
        let detail = if tail.is_empty() {
            "No audio was captured".to_string()
        } else {
            format!("No audio was captured: {}", tail)
        };
        return Err(detail);
    }

    Ok(Response::new(bytes))
}
