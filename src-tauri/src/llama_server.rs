use serde::Serialize;
use std::net::TcpListener;
use std::process::{Command, Stdio};

#[derive(Debug, Serialize)]
pub struct LlamaServerLaunchResult {
	pub pid: u32,
	pub port: u16,
}

#[tauri::command]
pub fn launch_llama_server() -> Result<LlamaServerLaunchResult, String> {
	let port = 8083u16;

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
		.arg("-b")
		.arg("1024")
		.arg("--port")
		.arg(port.to_string())
		.arg("--n-gpu-layers")
		.arg("99")
		.arg("-fa")
		.arg("on")
		.arg("--parallel")
		.arg("2")
		.stdin(Stdio::null())
		.stdout(Stdio::null())
		.stderr(Stdio::null())
		.spawn()
		.map_err(|e| format!("Failed to start llama-server: {}", e))?;

	Ok(LlamaServerLaunchResult {
		pid: child.id(),
		port,
	})
}
