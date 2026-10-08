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

#[cfg(target_os = "linux")]
mod wayland_portal;

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

/// Port: register a global shortcut and deliver activations to a callback.
///
/// Backends differ a lot between platforms (the Wayland portal assigns the key
/// through a user dialog and cannot unbind), so this is the lowest common shape.
pub trait GlobalShortcutBackend: Send + Sync {
    fn register(
        &self,
        id: &str,
        trigger: &str,
        description: &str,
        on_activated: ActivatedHandler,
    ) -> Result<(), GlobalShortcutError>;

    /// Best effort. The Wayland portal does not allow unbinding.
    #[allow(dead_code)]
    fn unregister(&self, id: &str) -> Result<(), GlobalShortcutError>;
}

/// Binds the clipboard shortcut for the current platform.
pub fn spawn(app: AppHandle) {
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
    if let Err(error) = backend.register(
        CLIPBOARD_SHORTCUT_ID,
        CLIPBOARD_SHORTCUT_TRIGGER,
        CLIPBOARD_SHORTCUT_DESCRIPTION,
        on_activated,
    ) {
        match error {
            // Silent where there is simply no backend yet.
            GlobalShortcutError::Unsupported => {}
            other => eprintln!("[global-shortcut] failed to register clipboard shortcut: {other}"),
        }
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
        _id: &str,
        _trigger: &str,
        _description: &str,
        _on_activated: ActivatedHandler,
    ) -> Result<(), GlobalShortcutError> {
        Err(GlobalShortcutError::Unsupported)
    }

    fn unregister(&self, _id: &str) -> Result<(), GlobalShortcutError> {
        Err(GlobalShortcutError::Unsupported)
    }
}
