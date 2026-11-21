//! App logging: `tauri-plugin-log` wired through `split()` so the file target
//! can use `app_data_dir()/logs` on every platform (the default `LogDir`
//! differs per OS). The file exists in dev builds only; prod logs go to
//! stdout and the webview console.
//!
//! Two runtime filters, both driven by the frontend settings:
//! - `set_log_level` gates the Rust `log::` macros via `log::set_max_level`.
//!   The plugin is built permissive (`Trace`) so this is the effective ceiling.
//! - `set_module_log` gates per-module targets through a fern filter. The
//!   plugin's webview command bypasses `max_level`, so frontend records are
//!   gated by the `appLog` wrapper instead; the fern filter only needs to
//!   handle Rust-side targets.
//!
//! The fern filter is a whitelist (`KNOWN_ROOTS`): our modules get the full
//! runtime range, every other target (dependency crates, the tracing→log
//! bridge) is capped at Warn so library instrumentation can never flood the
//! log regardless of the chosen level.

use std::collections::HashMap;
use std::sync::RwLock;

use log::LevelFilter;
use once_cell::sync::Lazy;
use tauri::AppHandle;
use tauri_plugin_log::{Builder, Target, TargetKind};

/// Toggleable log modules; mirrors `ErrorFeature` in `errorStore.svelte.ts`.
/// Rust log sites use these as explicit `target:` values.
pub const LOG_MODULES: [&str; 6] = ["inference", "tts", "runner", "db", "capture", "ui"];

/// Targets whose records get the full runtime range (subject to the module
/// toggle). Everything else is a dependency (xn, candle, hyper, tauri, …) and
/// is capped at Warn: libraries emit massive trace/info instrumentation (the
/// `xn`/candle tensor ops alone flood the terminal during TTS synthesis), and
/// their noise must never be user-configurable — only their real warnings and
/// errors pass.
const KNOWN_ROOTS: [&str; 9] = [
    "inference",
    "tts",
    "runner",
    "db",
    "capture",
    "ui",
    // Frontend records (`appLog` gates these before the IPC; the target here
    // is `webview::<callsite>`).
    "webview",
    // Our own crate, for any Rust log site without an explicit target.
    "things_lib",
    "things",
];

static MODULE_ENABLED: Lazy<RwLock<HashMap<String, bool>>> = Lazy::new(|| {
    RwLock::new(
        LOG_MODULES
            .iter()
            .map(|module| (module.to_string(), true))
            .collect(),
    )
});

/// Whether a known module's records pass its toggle.
fn module_enabled(target: &str) -> bool {
    let module = target.split("::").next().unwrap_or(target);
    let map = MODULE_ENABLED
        .read()
        .unwrap_or_else(|poison| poison.into_inner());
    map.get(module).copied().unwrap_or(true)
}

/// The fern filter: known roots follow the module toggle, everything else is
/// capped at Warn. This filter sees *every* record — including those injected
/// by direct `logger().log(...)` calls (the `tracing`→`log` bridge forwarding
/// xn/candle tensor ops, and the plugin's webview command), which bypass
/// `log::max_level()`. A whitelist (not a per-crate blocklist) so no future
/// dependency can reintroduce the flood.
fn record_allowed(metadata: &log::Metadata) -> bool {
    let root = metadata.target().split("::").next().unwrap_or("");
    if !KNOWN_ROOTS.contains(&root) {
        return metadata.level() <= log::Level::Warn;
    }
    module_enabled(metadata.target())
}

/// Builds and attaches the logger, then registers the plugin (its `log`
/// command). Called first in the app setup so later startup code is captured.
pub fn init(app: &AppHandle) -> Result<(), String> {
    let mut builder = Builder::new()
        .level(LevelFilter::Trace)
        .filter(record_allowed)
        .clear_targets()
        .target(Target::new(TargetKind::Stdout))
        .target(Target::new(TargetKind::Webview));

    if tauri::is_dev() {
        let dir = crate::db_manager::logs_dir(app)?;
        builder = builder.target(Target::new(TargetKind::Folder {
            path: dir,
            file_name: Some("things".to_string()),
        }));
    }

    let (plugin, max_level, logger) = builder.split(app).map_err(|error| error.to_string())?;
    tauri_plugin_log::attach_logger(max_level, logger).map_err(|error| error.to_string())?;
    app.plugin(plugin).map_err(|error| error.to_string())?;
    Ok(())
}

/// Sets the global ceiling for Rust-side logs. Levels match the plugin's
/// `LogLevel`: 1=Trace, 2=Debug, 3=Info, 4=Warn, 5=Error.
#[tauri::command]
pub fn set_log_level(level: u8) {
    let filter = match level {
        1 => LevelFilter::Trace,
        2 => LevelFilter::Debug,
        4 => LevelFilter::Warn,
        5 => LevelFilter::Error,
        _ => LevelFilter::Info,
    };
    log::set_max_level(filter);
}

/// Enables/silences one log module for Rust-side records. Unknown modules are
/// ignored so a stale frontend cannot inject arbitrary filter keys.
#[tauri::command]
pub fn set_module_log(module: String, enabled: bool) {
    let mut map = MODULE_ENABLED
        .write()
        .unwrap_or_else(|poison| poison.into_inner());
    if map.contains_key(&module) {
        map.insert(module, enabled);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn module_filter_defaults_open_and_toggles_known_modules_only() {
        assert!(module_enabled("db"));
        assert!(module_enabled("hyper::http"));
        assert!(module_enabled("webview::src/stores/dbState.svelte.ts:10:2"));

        set_module_log("db".to_string(), false);
        assert!(!module_enabled("db"));
        assert!(!module_enabled("db::nested"));
        assert!(module_enabled("capture"));

        set_module_log("not-a-module".to_string(), false);
        assert!(module_enabled("not-a-module"));

        set_module_log("db".to_string(), true);
        assert!(module_enabled("db"));
    }

    #[test]
    fn unknown_targets_are_capped_at_warn_known_modules_keep_range() {
        fn md(target: &str, level: log::Level) -> log::Metadata<'_> {
            log::Metadata::builder().target(target).level(level).build()
        }

        // Dependency noise (the xn/candle tensor-op flood and tracing span
        // lifecycle) dies at the filter…
        assert!(!record_allowed(&md("xn::quantized::k_quants", log::Level::Info)));
        assert!(!record_allowed(&md("tracing::span::active", log::Level::Trace)));
        assert!(!record_allowed(&md("hyper::http", log::Level::Debug)));
        // …while its real warnings/errors still pass…
        assert!(record_allowed(&md("xn::quantized::k_quants", log::Level::Warn)));
        assert!(record_allowed(&md("tracing::span", log::Level::Error)));
        // …and our modules keep the full range, gated by the module toggle.
        assert!(record_allowed(&md("db", log::Level::Trace)));
        assert!(record_allowed(&md("tts", log::Level::Debug)));
        assert!(record_allowed(&md(
            "webview::src/stores/dbState.svelte.ts:10:2",
            log::Level::Info
        )));
        assert!(record_allowed(&md("things_lib::llama_server", log::Level::Info)));

        set_module_log("db".to_string(), false);
        assert!(!record_allowed(&md("db", log::Level::Info)));
        set_module_log("db".to_string(), true);
        assert!(record_allowed(&md("db", log::Level::Info)));
    }
}
