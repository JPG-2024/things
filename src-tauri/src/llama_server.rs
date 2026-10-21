use serde::{Deserialize, Serialize};
use std::fs::File;
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;
use tauri::Manager;

const MIN_PORT: u16 = 1024;
const DEFAULT_INFERENCE_HOST: &str = "127.0.0.1";
const DEFAULT_EMBEDDINGS_HOST: &str = "0.0.0.0";
const HEALTH_TIMEOUT_MS: u64 = 1500;

/// llama-server memory tuning for the inference server. The context window
/// bounds the KV-cache allocation; the prompt-cache budget bounds how much
/// previously processed prompt state is kept in RAM across requests.
const DEFAULT_INFERENCE_CTX: u32 = 32768;
const DEFAULT_CACHE_RAM_MB: u32 = 1024;
const MIN_INFERENCE_CTX: u32 = 512;
const MAX_INFERENCE_CTX: u32 = 131_072;
const MAX_CACHE_RAM_MB: u32 = 65_536;

fn env_u32(key: &str) -> Option<u32> {
    env_string(key).and_then(|value| value.parse::<u32>().ok())
}

/// Resolve the inference context size: explicit IPC value, then
/// `LLAMA_INFERENCE_CTX`, then the default. Always kept inside a sane range.
fn effective_inference_ctx(raw: Option<u32>) -> u32 {
    let value = raw.or_else(|| env_u32("LLAMA_INFERENCE_CTX"));
    value
        .unwrap_or(DEFAULT_INFERENCE_CTX)
        .clamp(MIN_INFERENCE_CTX, MAX_INFERENCE_CTX)
}

/// Resolve the prompt-cache budget in MiB: explicit IPC value, then
/// `LLAMA_CACHE_RAM_MB`, then the default. 0 disables the prompt cache.
fn effective_cache_ram_mb(raw: Option<u32>) -> u32 {
    let value = raw.or_else(|| env_u32("LLAMA_CACHE_RAM_MB"));
    value.unwrap_or(DEFAULT_CACHE_RAM_MB).min(MAX_CACHE_RAM_MB)
}

/// Owns the llama-server child processes the app started. Servers that were
/// already running before the app (or started outside it) are never tracked
/// here, so they are never killed on exit.
pub struct LlamaServersState {
    inference: Mutex<Option<Child>>,
    embeddings: Mutex<Option<Child>>,
}

impl Default for LlamaServersState {
    fn default() -> Self {
        Self {
            inference: Mutex::new(None),
            embeddings: Mutex::new(None),
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlamaServerTarget {
    pub model: String,
    pub port: u16,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlamaServersConfig {
    pub models_dir: String,
    pub inference: LlamaServerTarget,
    pub embeddings: LlamaServerTarget,
    #[serde(default)]
    pub restart: bool,
    /// Inference context window in tokens (KV-cache size bound).
    #[serde(default)]
    pub inference_ctx_size: Option<u32>,
    /// Prompt-cache budget for the inference server in MiB (0 disables it).
    #[serde(default)]
    pub cache_ram_mb: Option<u32>,
    /// Whether the inference server should allow/emit thinking. `None` omits
    /// the flag (llama default: auto).
    #[serde(default)]
    pub reasoning: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlamaServerStatus {
    pub name: String,
    pub port: u16,
    pub running: bool,
    pub healthy: bool,
    pub pid: Option<u32>,
    pub error: Option<String>,
}

impl LlamaServerStatus {
    fn error(name: &str, port: u16, error: String) -> Self {
        Self {
            name: name.to_string(),
            port,
            running: false,
            healthy: false,
            pid: None,
            error: Some(error),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlamaServerRuntime {
    pub name: String,
    pub running: bool,
    pub pid: Option<u32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlamaModelEntry {
    pub name: String,
    pub size_bytes: u64,
    pub modified: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlamaModelsListing {
    pub dir: String,
    pub models: Vec<LlamaModelEntry>,
}

fn env_string(key: &str) -> Option<String> {
    std::env::var(key)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

/// Resolve the folder holding the local models. Precedence: the value coming
/// from the frontend, then `LLAMA_MODELS_DIR`, then `~/Downloads/models`.
fn effective_models_dir(raw: &str) -> String {
    let trimmed = raw.trim();
    if !trimmed.is_empty() {
        return trimmed.to_string();
    }
    if let Some(dir) = env_string("LLAMA_MODELS_DIR") {
        return dir;
    }
    dirs::home_dir()
        .map(|home| home.join("Downloads").join("models"))
        .map(|path| path.to_string_lossy().to_string())
        .unwrap_or_default()
}

fn binary_candidates() -> Vec<PathBuf> {
    match env_string("LLAMA_BIN") {
        Some(bin) => vec![PathBuf::from(bin)],
        None => vec![PathBuf::from("llama"), PathBuf::from("llama-server")],
    }
}

fn split_extra_args(key: &str) -> Vec<String> {
    env_string(key)
        .map(|value| {
            value
                .split_whitespace()
                .map(|part| part.to_string())
                .collect()
        })
        .unwrap_or_default()
}

fn validate_port(port: u16, name: &str) -> Result<(), String> {
    if port < MIN_PORT {
        return Err(format!(
            "{} port {} is privileged (minimum allowed is {})",
            name, port, MIN_PORT
        ));
    }
    Ok(())
}

/// Resolve a model reference coming from the frontend. Only a bare file name is
/// accepted so an attacker-controlled IPC payload can never escape the models
/// directory or point at an arbitrary path.
fn resolve_model(dir: &Path, name: &str) -> Result<PathBuf, String> {
    let candidate = Path::new(name);
    if candidate.file_name().and_then(|value| value.to_str()) != Some(name) {
        return Err(format!("invalid model name: {}", name));
    }
    let root = std::fs::canonicalize(dir)
        .map_err(|error| format!("models directory invalid: {} ({})", dir.display(), error))?;
    let full =
        std::fs::canonicalize(root.join(name)).map_err(|_| format!("model not found: {}", name))?;
    if !full.starts_with(&root) {
        return Err(format!("model outside models directory: {}", name));
    }
    let is_gguf = full
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.eq_ignore_ascii_case("gguf"))
        .unwrap_or(false);
    if !is_gguf {
        return Err(format!("model must be a .gguf file: {}", name));
    }
    Ok(full)
}

fn build_args(
    name: &str,
    model: &str,
    host: &str,
    port: u16,
    extra: &[String],
    inference_ctx: u32,
    cache_ram_mb: u32,
    reasoning: Option<bool>,
) -> Vec<String> {
    let mut args: Vec<String> = match name {
        "embeddings" => vec![
            "-m".into(),
            model.into(),
            "--embedding".into(),
            "--pooling".into(),
            "mean".into(),
            "--n-gpu-layers".into(),
            "99".into(),
            "--ctx-size".into(),
            "8192".into(),
        ],
        _ => {
            let mut inference_args = vec![
                "-m".into(),
                model.into(),
                "-c".into(),
                inference_ctx.to_string(),
                "-b".into(),
                "512".into(),
                "--n-gpu-layers".into(),
                "99".into(),
                "--cache-ram".into(),
                cache_ram_mb.to_string(),
                "--ctx-checkpoints".into(),
                "0".into(),
                "--cache-type-k".into(),
                "q8_0".into(),
                "--cache-type-v".into(),
                "q8_0".into(),
            ];
            if let Some(reasoning) = reasoning {
                inference_args.push("--reasoning".into());
                inference_args.push(if reasoning { "on" } else { "off" }.into());
            }
            inference_args
        }
    };
    args.push("--host".into());
    args.push(host.into());
    args.push("--port".into());
    args.push(port.to_string());
    args.extend_from_slice(extra);
    args
}

fn live_child_pid(slot: &Mutex<Option<Child>>) -> Option<u32> {
    if let Ok(mut guard) = slot.lock() {
        if let Some(child) = guard.as_mut() {
            match child.try_wait() {
                Ok(None) => return Some(child.id()),
                _ => *guard = None,
            }
        }
    }
    None
}

async fn service_healthy(client: &reqwest::Client, port: u16) -> bool {
    let urls = [
        format!("http://127.0.0.1:{}/health", port),
        format!("http://127.0.0.1:{}/v1/models", port),
    ];
    for url in urls {
        if let Ok(response) = client
            .get(&url)
            .timeout(Duration::from_millis(HEALTH_TIMEOUT_MS))
            .send()
            .await
        {
            if response.status().is_success() {
                return true;
            }
        }
    }
    false
}

fn port_in_use(port: u16) -> bool {
    TcpListener::bind(("127.0.0.1", port)).is_err()
}

async fn wait_for_ports_free(ports: [u16; 2]) {
    for _ in 0..25 {
        if ports.iter().all(|port| !port_in_use(*port)) {
            return;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
}

fn log_file(app: &tauri::AppHandle, name: &str) -> Result<File, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("failed to resolve app data dir: {}", error))?;
    std::fs::create_dir_all(&dir)
        .map_err(|error| format!("failed to create app data dir: {}", error))?;
    let path = dir.join(format!("llama-server-{}.log", name));
    File::create(&path)
        .map_err(|error| format!("failed to create log file {}: {}", path.display(), error))
}

fn is_sensitive_env(key: &str) -> bool {
    let upper = key.to_ascii_uppercase();
    upper.starts_with("VITE_")
        || upper.ends_with("_API_KEY")
        || upper.ends_with("_TOKEN")
        || upper.ends_with("_SECRET")
}

/// Try each candidate binary until one spawns. The child inherits the parent
/// environment (so GPU/toolkit variables keep working) minus anything that
/// looks like an app secret, so keys from `.env` never leak to it.
fn spawn_server(app: &tauri::AppHandle, name: &str, args: &[String]) -> Result<Child, String> {
    let mut last_error = String::from("no binary candidates");

    for bin in binary_candidates() {
        let stdout = log_file(app, name)?;
        let stderr = stdout
            .try_clone()
            .map_err(|error| format!("failed to clone log handle: {}", error))?;

        let mut command = Command::new(&bin);
        command
            .arg("serve")
            .args(args)
            .stdin(Stdio::null())
            .stdout(Stdio::from(stdout))
            .stderr(Stdio::from(stderr));

        for (key, _) in std::env::vars() {
            if is_sensitive_env(&key) {
                command.env_remove(&key);
            }
        }

        match command.spawn() {
            Ok(child) => return Ok(child),
            Err(error) => last_error = format!("{}: {}", bin.display(), error),
        }
    }

    Err(format!("failed to start llama-server ({})", last_error))
}

async fn ensure_slot(
    app: &tauri::AppHandle,
    slot: &Mutex<Option<Child>>,
    name: &str,
    port: u16,
    args: &[String],
) -> LlamaServerStatus {
    let client = reqwest::Client::new();
    let healthy = service_healthy(&client, port).await;
    let occupied = port_in_use(port);

    if healthy || occupied {
        return LlamaServerStatus {
            name: name.to_string(),
            port,
            running: true,
            healthy,
            pid: live_child_pid(slot),
            error: None,
        };
    }

    match spawn_server(app, name, args) {
        Ok(child) => {
            let pid = child.id();
            if let Ok(mut guard) = slot.lock() {
                *guard = Some(child);
            }
            LlamaServerStatus {
                name: name.to_string(),
                port,
                running: true,
                healthy: false,
                pid: Some(pid),
                error: None,
            }
        }
        Err(error) => LlamaServerStatus::error(name, port, error),
    }
}

async fn ensure_named(
    app: &tauri::AppHandle,
    slot: &Mutex<Option<Child>>,
    name: &str,
    target: &LlamaServerTarget,
    models_dir: &str,
    host_env: &str,
    default_host: &str,
    extra_env: &str,
    default_model_env: &str,
    inference_ctx: u32,
    cache_ram_mb: u32,
    reasoning: Option<bool>,
) -> LlamaServerStatus {
    let port = target.port;
    if let Err(error) = validate_port(port, name) {
        return LlamaServerStatus::error(name, port, error);
    }

    let model_name = if target.model.trim().is_empty() {
        env_string(default_model_env).unwrap_or_default()
    } else {
        target.model.trim().to_string()
    };
    if model_name.is_empty() {
        return LlamaServerStatus::error(name, port, format!("no {} model selected", name));
    }

    let model = match resolve_model(Path::new(models_dir), &model_name) {
        Ok(path) => path.to_string_lossy().to_string(),
        Err(error) => return LlamaServerStatus::error(name, port, error),
    };

    let host = env_string(host_env).unwrap_or_else(|| default_host.to_string());
    let extra = split_extra_args(extra_env);
    let args = build_args(
        name,
        &model,
        &host,
        port,
        &extra,
        inference_ctx,
        cache_ram_mb,
        reasoning,
    );

    ensure_slot(app, slot, name, port, &args).await
}

/// Health-check both llama-server instances and spawn the ones that are down.
/// Servers already running are left untouched.
#[tauri::command]
pub async fn ensure_llama_servers(
    app: tauri::AppHandle,
    state: tauri::State<'_, LlamaServersState>,
    config: LlamaServersConfig,
) -> Result<Vec<LlamaServerStatus>, String> {
    let models_dir = effective_models_dir(&config.models_dir);
    let servers = state.inner();

    if config.restart {
        kill_spawned_servers(servers);
        wait_for_ports_free([config.inference.port, config.embeddings.port]).await;
    }

    // Memory tuning only affects the inference server; the embeddings server
    // keeps its fixed context. Resolved once per ensure call so a restart with
    // new settings respawns with fresh args.
    let inference_ctx = effective_inference_ctx(config.inference_ctx_size);
    let cache_ram_mb = effective_cache_ram_mb(config.cache_ram_mb);

    let inference = ensure_named(
        &app,
        &servers.inference,
        "inference",
        &config.inference,
        &models_dir,
        "LLAMA_INFERENCE_HOST",
        DEFAULT_INFERENCE_HOST,
        "LLAMA_INFERENCE_EXTRA_ARGS",
        "LLAMA_INFERENCE_MODEL",
        inference_ctx,
        cache_ram_mb,
        config.reasoning,
    )
    .await;

    let embeddings = ensure_named(
        &app,
        &servers.embeddings,
        "embeddings",
        &config.embeddings,
        &models_dir,
        "LLAMA_EMBEDDINGS_HOST",
        DEFAULT_EMBEDDINGS_HOST,
        "LLAMA_EMBEDDINGS_EXTRA_ARGS",
        "LLAMA_EMBEDDINGS_MODEL",
        inference_ctx,
        cache_ram_mb,
        config.reasoning,
    )
    .await;

    Ok(vec![inference, embeddings])
}

/// List `.gguf` files directly inside the models directory (no recursion).
#[tauri::command]
pub fn list_llama_models(dir: String) -> Result<LlamaModelsListing, String> {
    let resolved = effective_models_dir(&dir);
    let root = std::fs::canonicalize(&resolved)
        .map_err(|error| format!("models directory invalid: {} ({})", resolved, error))?;
    if !root.is_dir() {
        return Err(format!("models path is not a directory: {}", resolved));
    }

    let mut models = Vec::new();
    let entries = std::fs::read_dir(&root)
        .map_err(|error| format!("failed to read models directory: {}", error))?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let is_gguf = path
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| value.eq_ignore_ascii_case("gguf"))
            .unwrap_or(false);
        if !is_gguf {
            continue;
        }
        let name = match path.file_name().and_then(|value| value.to_str()) {
            Some(name) => name.to_string(),
            None => continue,
        };
        let metadata = entry.metadata().ok();
        let size_bytes = metadata.as_ref().map(|meta| meta.len()).unwrap_or(0);
        let modified = metadata
            .and_then(|meta| meta.modified().ok())
            .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|duration| duration.as_secs())
            .unwrap_or(0);
        models.push(LlamaModelEntry {
            name,
            size_bytes,
            modified,
        });
    }
    models.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    Ok(LlamaModelsListing {
        dir: root.to_string_lossy().to_string(),
        models,
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlamaDefaults {
    pub models_dir: String,
    pub inference_model: String,
    pub embeddings_model: String,
    pub inference_port: u16,
    pub embeddings_port: u16,
}

/// Env-backed defaults for the first run, before the user picks anything in
/// Settings. The UI only uses these to seed empty fields.
#[tauri::command]
pub fn llama_defaults() -> LlamaDefaults {
    LlamaDefaults {
        models_dir: effective_models_dir(""),
        inference_model: env_string("LLAMA_INFERENCE_MODEL").unwrap_or_default(),
        embeddings_model: env_string("LLAMA_EMBEDDINGS_MODEL").unwrap_or_default(),
        inference_port: env_string("LLAMA_INFERENCE_PORT")
            .and_then(|value| value.parse().ok())
            .unwrap_or(8080),
        embeddings_port: env_string("LLAMA_EMBEDDINGS_PORT")
            .and_then(|value| value.parse().ok())
            .unwrap_or(8083),
    }
}

fn runtime_for(slot: &Mutex<Option<Child>>, name: &str) -> LlamaServerRuntime {
    let pid = live_child_pid(slot);
    LlamaServerRuntime {
        name: name.to_string(),
        running: pid.is_some(),
        pid,
    }
}

/// Report which app-spawned servers are still alive, without starting anything.
/// Servers started outside the app are never reported here; the frontend must
/// combine this with HTTP health to know if something is serving on the port.
#[tauri::command]
pub fn llama_servers_runtime(
    state: tauri::State<'_, LlamaServersState>,
) -> Vec<LlamaServerRuntime> {
    let servers = state.inner();
    vec![
        runtime_for(&servers.inference, "inference"),
        runtime_for(&servers.embeddings, "embeddings"),
    ]
}

/// Kill only the processes this app spawned, then wait briefly for the ports to
/// free up so an immediate restart can bind them.
#[tauri::command]
pub async fn stop_llama_servers(
    state: tauri::State<'_, LlamaServersState>,
    config: LlamaServersConfig,
) -> Result<(), String> {
    kill_spawned_servers(state.inner());
    wait_for_ports_free([config.inference.port, config.embeddings.port]).await;
    Ok(())
}

/// Kill only the processes this app spawned.
pub fn kill_spawned_servers(state: &LlamaServersState) {
    for slot in [&state.inference, &state.embeddings] {
        if let Ok(mut guard) = slot.lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn unique_dir(label: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("things-llama-{}-{}", label, std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn resolve_model_accepts_gguf_inside_dir() {
        let dir = unique_dir("accept");
        std::fs::write(dir.join("model.gguf"), b"x").unwrap();
        let resolved = resolve_model(&dir, "model.gguf").unwrap();
        assert!(resolved.ends_with("model.gguf"));
    }

    #[test]
    fn resolve_model_rejects_path_traversal() {
        let dir = unique_dir("traversal");
        std::fs::write(dir.join("model.gguf"), b"x").unwrap();
        assert!(resolve_model(&dir, "../model.gguf").is_err());
    }

    #[test]
    fn resolve_model_rejects_non_gguf() {
        let dir = unique_dir("extension");
        std::fs::write(dir.join("model.bin"), b"x").unwrap();
        assert!(resolve_model(&dir, "model.bin").is_err());
    }

    #[test]
    fn build_args_places_port_and_extra_last() {
        let extra = vec!["--threads".to_string(), "8".to_string()];
        let args = build_args(
            "inference",
            "/models/a.gguf",
            "127.0.0.1",
            8080,
            &extra,
            16384,
            512,
            None,
        );
        let port_index = args.iter().position(|arg| arg == "--port").unwrap();
        assert_eq!(args[port_index + 1], "8080");
        assert_eq!(&args[args.len() - 2..], &extra[..]);
        assert!(args.iter().any(|arg| arg == "--cache-type-k"));
    }

    #[test]
    fn build_args_marks_embeddings_mode() {
        let args = build_args(
            "embeddings",
            "/models/b.gguf",
            "0.0.0.0",
            8083,
            &[],
            16384,
            512,
            Some(false),
        );
        assert!(args.iter().any(|arg| arg == "--embedding"));
        assert!(args.iter().any(|arg| arg == "--pooling"));
        // Embeddings keep their fixed context; memory tuning is inference-only.
        assert!(args.iter().any(|arg| arg == "--ctx-size"));
        // The reasoning flag only applies to the inference server.
        assert!(!args.iter().any(|arg| arg == "--reasoning"));
    }

    #[test]
    fn build_args_uses_configured_context_and_cache() {
        let args = build_args(
            "inference",
            "/models/a.gguf",
            "127.0.0.1",
            8080,
            &[],
            8192,
            256,
            None,
        );
        let ctx_index = args.iter().position(|arg| arg == "-c").unwrap();
        assert_eq!(args[ctx_index + 1], "8192");
        let cache_index = args.iter().position(|arg| arg == "--cache-ram").unwrap();
        assert_eq!(args[cache_index + 1], "256");
    }

    #[test]
    fn build_args_emits_reasoning_on_and_off_for_inference() {
        let off = build_args(
            "inference",
            "/models/a.gguf",
            "127.0.0.1",
            8080,
            &[],
            16384,
            512,
            Some(false),
        );
        let off_index = off.iter().position(|arg| arg == "--reasoning").unwrap();
        assert_eq!(off[off_index + 1], "off");

        let on = build_args(
            "inference",
            "/models/a.gguf",
            "127.0.0.1",
            8080,
            &[],
            16384,
            512,
            Some(true),
        );
        let on_index = on.iter().position(|arg| arg == "--reasoning").unwrap();
        assert_eq!(on[on_index + 1], "on");
    }

    #[test]
    fn build_args_omits_reasoning_when_none() {
        let args = build_args(
            "inference",
            "/models/a.gguf",
            "127.0.0.1",
            8080,
            &[],
            16384,
            512,
            None,
        );
        assert!(!args.iter().any(|arg| arg == "--reasoning"));
    }

    #[test]
    fn effective_inference_ctx_clamps_and_defaults() {
        assert_eq!(effective_inference_ctx(None), DEFAULT_INFERENCE_CTX);
        assert_eq!(effective_inference_ctx(Some(8192)), 8192);
        assert_eq!(effective_inference_ctx(Some(1)), MIN_INFERENCE_CTX);
        assert_eq!(effective_inference_ctx(Some(u32::MAX)), MAX_INFERENCE_CTX);
    }

    #[test]
    fn effective_cache_ram_clamps_high_and_allows_zero() {
        assert_eq!(effective_cache_ram_mb(None), DEFAULT_CACHE_RAM_MB);
        assert_eq!(effective_cache_ram_mb(Some(0)), 0);
        assert_eq!(effective_cache_ram_mb(Some(u32::MAX)), MAX_CACHE_RAM_MB);
    }

    #[test]
    fn sensitive_env_detection_keeps_gpu_vars() {
        assert!(is_sensitive_env("VITE_OPENROUTER_API_KEY"));
        assert!(is_sensitive_env("SOME_API_KEY"));
        assert!(is_sensitive_env("MY_TOKEN"));
        assert!(!is_sensitive_env("PATH"));
        assert!(!is_sensitive_env("HSA_OVERRIDE_GFX_VERSION"));
    }
}
