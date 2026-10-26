//! Global shortcut port.
//!
//! The OS-global shortcut is the only thing here that is platform specific, so
//! it lives behind the [`GlobalShortcutBackend`] port. Only the Wayland portal
//! adapter (`wayland_portal`, Linux) is implemented for now; other platforms
//! fall back to [`NoopBackend`] so the crate still builds everywhere.
//!
//! On Linux/Wayland the shortcut key is assigned by the user through the
//! `org.freedesktop.portal.GlobalShortcuts` dialog, which is why the port takes
//! a *preferred* trigger and treats `unregister` as best effort.
//!
//! The flow is intentionally split in two modes so the desktop dialog only
//! appears when the user asks for it:
//!
//! - [`GlobalShortcutMode::Probe`] looks for an already-bound shortcut and
//!   starts listening if it exists. It never shows a dialog.
//! - [`GlobalShortcutMode::Bind`] binds the shortcut when it is missing, which
//!   is the only path that can show the desktop confirmation dialog.

#[cfg(target_os = "linux")]
mod wayland_portal;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use futures::channel::oneshot;
use tauri::{AppHandle, Emitter};

/// Logical id of the clipboard shortcut.
pub const CLIPBOARD_SHORTCUT_ID: &str = "clipboard";
/// Preferred trigger, per the XDG Shortcuts Specification (`CTRL+SHIFT+v`).
pub const CLIPBOARD_SHORTCUT_TRIGGER: &str = "CTRL+SHIFT+v";
/// User-readable description shown in the portal dialog.
pub const CLIPBOARD_SHORTCUT_DESCRIPTION: &str = "Read clipboard content";
/// Tauri event emitted on each shortcut activation.
pub const GLOBAL_CLIPBOARD_TRIGGER_EVENT: &str = "global-clipboard-trigger";

/// Callback invoked on each shortcut activation.
pub type ActivatedHandler = Box<dyn Fn() + Send + Sync>;

/// How the shortcut session should behave.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GlobalShortcutMode {
    /// Only reuse an already-bound shortcut. Never opens a dialog.
    Probe,
    /// Bind the shortcut when it is missing. May open the confirmation dialog.
    Bind,
}

#[allow(dead_code)]
#[derive(Debug)]
pub enum GlobalShortcutError {
    /// No backend is available on this platform.
    Unsupported,
    /// The backend failed (portal unavailable, user cancelled, ...).
    Backend(String),
}

impl std::fmt::Display for GlobalShortcutError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Unsupported => write!(f, "global shortcuts are not supported on this platform"),
            Self::Backend(message) => write!(f, "{message}"),
        }
    }
}

impl std::error::Error for GlobalShortcutError {}

/// Resolves with the bound trigger (e.g. `CTRL+SHIFT+v`) when the shortcut is
/// bound and activations are being listened to, or `None` when it is not bound.
pub type RegisterResult = oneshot::Receiver<Result<Option<String>, GlobalShortcutError>>;

/// Port: register a global shortcut and deliver activations to a callback.
///
/// Backends differ a lot between platforms (the Wayland portal assigns the key
/// through a user dialog and cannot unbind), so this is the lowest common shape.
pub trait GlobalShortcutBackend: Send + Sync {
    fn register(
        &self,
        mode: GlobalShortcutMode,
        id: &str,
        trigger: &str,
        description: &str,
        on_activated: ActivatedHandler,
    ) -> Result<RegisterResult, GlobalShortcutError>;

    /// Best effort. The Wayland portal does not allow unbinding.
    #[allow(dead_code)]
    fn unregister(&self, id: &str) -> Result<(), GlobalShortcutError>;
}

/// Whether the app is already listening for the shortcut in this run.
///
/// Kept outside the backend so probe/register calls stay idempotent: once a
/// listener owns the portal session, later calls resolve immediately instead of
/// spawning a second session. The trigger reported by the desktop is cached too
/// so the UI can display the real key even after a rebind.
#[derive(Default)]
pub struct GlobalShortcutState {
    registered: AtomicBool,
    trigger: Mutex<Option<String>>,
}

impl GlobalShortcutState {
    pub fn is_registered(&self) -> bool {
        self.registered.load(Ordering::SeqCst)
    }

    pub fn mark_registered(&self, trigger: Option<String>) {
        self.registered.store(true, Ordering::SeqCst);
        if let Ok(mut current) = self.trigger.lock() {
            *current = trigger;
        }
    }

    pub fn trigger(&self) -> Option<String> {
        self.trigger.lock().ok().and_then(|value| value.clone())
    }
}

/// Probes or binds the clipboard shortcut for the current platform.
pub async fn request(
    app: AppHandle,
    mode: GlobalShortcutMode,
) -> Result<Option<String>, GlobalShortcutError> {
    // The portal app id must be a valid reverse-DNS id matching an installed
    // `<identifier>.desktop` file. Deriving it from the Tauri identifier keeps
    // it in sync with `tauri.conf.json`.
    let app_id = app.config().identifier.clone();

    let on_activated: ActivatedHandler = Box::new(move || {
        if let Err(error) = app.emit(GLOBAL_CLIPBOARD_TRIGGER_EVENT, ()) {
            eprintln!("[global-shortcut] failed to emit activation event: {error}");
        }
    });

    let backend = create_backend(app_id);
    let receiver = backend.register(
        mode,
        CLIPBOARD_SHORTCUT_ID,
        CLIPBOARD_SHORTCUT_TRIGGER,
        CLIPBOARD_SHORTCUT_DESCRIPTION,
        on_activated,
    )?;

    match receiver.await {
        Ok(result) => result,
        Err(_) => Err(GlobalShortcutError::Backend(
            "shortcut session ended before reporting a result".to_string(),
        )),
    }
}

#[cfg(target_os = "linux")]
fn create_backend(app_id: String) -> Box<dyn GlobalShortcutBackend> {
    Box::new(wayland_portal::WaylandPortalBackend::new(app_id))
}

#[cfg(not(target_os = "linux"))]
fn create_backend(_app_id: String) -> Box<dyn GlobalShortcutBackend> {
    Box::new(NoopBackend)
}

/// Placeholder backend for platforms that are not wired up yet.
#[cfg(not(target_os = "linux"))]
struct NoopBackend;

#[cfg(not(target_os = "linux"))]
impl GlobalShortcutBackend for NoopBackend {
    fn register(
        &self,
        _mode: GlobalShortcutMode,
        _id: &str,
        _trigger: &str,
        _description: &str,
        _on_activated: ActivatedHandler,
    ) -> Result<RegisterResult, GlobalShortcutError> {
        Err(GlobalShortcutError::Unsupported)
    }

    fn unregister(&self, _id: &str) -> Result<(), GlobalShortcutError> {
        Err(GlobalShortcutError::Unsupported)
    }
}
