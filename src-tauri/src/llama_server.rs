use serde::Serialize;
use std::net::TcpListener;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::State;

pub struct LlamaServerState(pub Mutex<Option<Child>>);

impl Default for LlamaServerState {
	fn default() -> Self {
		Self(Mutex::new(None))
	}
}

#[derive(Debug, Serialize)]
pub struct LlamaServerLaunchResult {
	pub pid: u32,
	pub port: u16,
}

#[tauri::command]
pub fn launch_llama_server(
	state: State<'_, LlamaServerState>,
) -> Result<LlamaServerLaunchResult, String> {
	let port = 8083u16;
	let mut guard = state
		.0
		.lock()
		.map_err(|e| format!("Failed to acquire llama-server state lock: {}", e))?;

	if let Some(existing_child) = guard.as_mut() {
		match existing_child.try_wait() {
			Ok(None) => {
				return Ok(LlamaServerLaunchResult {
					pid: existing_child.id(),
					port,
				});
			}
			Ok(Some(_)) => {
				*guard = None;
			}
			Err(e) => {
				return Err(format!(
					"Failed to check existing llama-server process status: {}",
					e
				));
			}
		}
	}

	let listener = TcpListener::bind(("127.0.0.1", port)).map_err(|_| {
		format!(
			"Port {} is already in use. llama-server was not started.",
			port
		)
	})?;
	drop(listener);

	let child = Command::new("llama-server")
        .arg("-hf")
        .arg("LiquidAI/LFM2.5-1.2B-Instruct-GGUF:Q4_K_M")
        .arg("-c")
        .arg("32768")
        .arg("-cb")
        .arg("32768")
        .arg("-b")
        .arg("512")
        .arg("--port")
        .arg(port.to_string())
        .arg("--n-gpu-layers")
        .arg("99")
        .arg("-fa")
        .arg("on")
        .arg("--parallel")
        .arg("1")
		.stdin(Stdio::null())
		.stdout(Stdio::null())
		.stderr(Stdio::null())
		.spawn()
		.map_err(|e| format!("Failed to start llama-server: {}", e))?;
	let pid = child.id();
	*guard = Some(child);

	Ok(LlamaServerLaunchResult {
		pid,
		port,
	})
}

pub fn stop_llama_server(state: &LlamaServerState) {
	if let Ok(mut guard) = state.0.lock() {
		if let Some(mut child) = guard.take() {
			let _ = child.kill();
			let _ = child.wait();
		}
	}
}
