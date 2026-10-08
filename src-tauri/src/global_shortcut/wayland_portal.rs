//! Wayland global shortcut adapter.
//!
//! Uses `org.freedesktop.portal.GlobalShortcuts` through `ashpd`. This is the
//! only supported mechanism on a Wayland session: X11 key grabs (`global-hotkey`
//! / `tauri-plugin-global-shortcut`) do not receive keys while a Wayland-native
//! window is focused.
//!
//! The portal binds the shortcut once (the user confirms the key in a dialog)
//! and cannot unbind it. `Activated` repeats while the shortcut is held, so the
//! adapter collapses a press/release cycle into a single activation.

use ashpd::desktop::global_shortcuts::{BindShortcutsOptions, GlobalShortcuts, NewShortcut};
use ashpd::desktop::CreateSessionOptions;
use ashpd::AppID;
use futures::stream::{select, StreamExt};

use super::{ActivatedHandler, GlobalShortcutBackend, GlobalShortcutError};

pub struct WaylandPortalBackend {
    /// Application id declared to the portal. Must be a valid reverse-DNS id
    /// that matches an installed `<app_id>.desktop` file.
    app_id: String,
}

impl WaylandPortalBackend {
    pub fn new(app_id: String) -> Self {
        Self { app_id }
    }
}

impl GlobalShortcutBackend for WaylandPortalBackend {
    fn register(
        &self,
        id: &str,
        trigger: &str,
        description: &str,
        on_activated: ActivatedHandler,
    ) -> Result<(), GlobalShortcutError> {
        let id = id.to_owned();
        let trigger = trigger.to_owned();
        let description = description.to_owned();
        let app_id = self.app_id.clone();

        // The portal flow is async and long-lived (it owns the session for as
        // long as the shortcut stays bound), so it runs on the Tauri runtime.
        tauri::async_runtime::spawn(async move {
            if let Err(error) = run(app_id, id, trigger, description, on_activated).await {
                eprintln!("[global-shortcut] portal backend error: {error}");
            }
        });

        Ok(())
    }

    fn unregister(&self, _id: &str) -> Result<(), GlobalShortcutError> {
        // The GlobalShortcuts portal has no unbind operation.
        Ok(())
    }
}

async fn run(
    app_id: String,
    id: String,
    trigger: String,
    description: String,
    on_activated: ActivatedHandler,
) -> Result<(), GlobalShortcutError> {
    // Identify this non-sandboxed app to the portal *before* any portal call.
    // GNOME's GlobalShortcuts backend rejects unidentified apps, so without
    // this the bind fails with "An app id is required".
    let app_id = AppID::try_from(app_id.as_str()).map_err(backend_error)?;
    ashpd::register_host_app(app_id)
        .await
        .map_err(backend_error)?;

    let portal = GlobalShortcuts::new().await.map_err(backend_error)?;

    let session = portal
        .create_session(CreateSessionOptions::default())
        .await
        .map_err(backend_error)?;

    let shortcut = NewShortcut::new(id.clone(), description).preferred_trigger(trigger.as_str());

    // `bind_shortcuts` resolves once the user has interacted with the portal
    // dialog (the underlying request awaits the Response signal).
    let request = portal
        .bind_shortcuts(&session, &[shortcut], None, BindShortcutsOptions::default())
        .await
        .map_err(backend_error)?;

    let response = request.response().map_err(backend_error)?;
    let was_bound = response.shortcuts().iter().any(|bound| bound.id() == id);

    if !was_bound {
        return Err(GlobalShortcutError::Backend(format!(
            "shortcut '{id}' was not bound (the user may have dismissed the dialog)"
        )));
    }

    let activated = portal
        .receive_activated()
        .await
        .map_err(backend_error)?
        .map(|event| (true, event.shortcut_id().to_owned()));
    let deactivated = portal
        .receive_deactivated()
        .await
        .map_err(backend_error)?
        .map(|event| (false, event.shortcut_id().to_owned()));

    let merged = select(activated, deactivated);
    futures::pin_mut!(merged);

    // `session` (and `portal`) stay in scope for the whole loop: dropping the
    // session would end the bound shortcuts.
    let mut is_active = false;

    while let Some((activated_now, event_id)) = merged.next().await {
        if event_id != id {
            continue;
        }

        if activated_now {
            if !is_active {
                is_active = true;
                on_activated();
            }
        } else {
            is_active = false;
        }
    }

    Ok(())
}

fn backend_error(error: ashpd::Error) -> GlobalShortcutError {
    GlobalShortcutError::Backend(error.to_string())
}
