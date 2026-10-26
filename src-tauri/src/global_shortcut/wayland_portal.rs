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
//!
//! Sessions are per-run, but the bound key itself is persisted by the desktop
//! (KGlobalAccel on KDE, the permission store on GNOME). `ListShortcuts`
//! therefore reports a previously accepted binding on the next launch, which is
//! what lets [`GlobalShortcutMode::Probe`] skip the dialog entirely.

use ashpd::desktop::global_shortcuts::{
    BindShortcutsOptions, GlobalShortcuts, ListShortcutsOptions, NewShortcut,
};
use ashpd::desktop::CreateSessionOptions;
use ashpd::desktop::Session;
use ashpd::AppID;
use futures::channel::oneshot;
use futures::stream::{select, StreamExt};
use std::sync::atomic::{AtomicBool, Ordering};

use super::{
    ActivatedHandler, GlobalShortcutBackend, GlobalShortcutError, GlobalShortcutMode,
    RegisterResult,
};

/// ashpd shares one process-wide D-Bus connection (`proxy.rs` keeps it in a
/// `OnceLock`) and `org.freedesktop.host.portal.Registry` associates one app id
/// per connection, so sending the identity more than once fails with "Could not
/// register app ID: Connection already associated with an application ID".
/// The registry is also slated for deprecation, so a failure here only degrades
/// gracefully instead of aborting the bind.
static HOST_APP_REGISTERED: AtomicBool = AtomicBool::new(false);

/// Identifies this non-sandboxed app to the portal *before* any portal call.
/// GNOME's GlobalShortcuts backend rejects unidentified apps, so without this
/// the bind fails with "An app id is required". Runs at most once per process.
async fn register_host_app_once(app_id: String) {
    if HOST_APP_REGISTERED.swap(true, Ordering::SeqCst) {
        return;
    }

    let app_id = match AppID::try_from(app_id.as_str()) {
        Ok(app_id) => app_id,
        Err(error) => {
            HOST_APP_REGISTERED.store(false, Ordering::SeqCst);
            eprintln!("[global-shortcut] invalid portal app id: {error}");
            return;
        }
    };

    match ashpd::register_host_app(app_id).await {
        Ok(()) => {}
        Err(error) => {
            let message = error.to_string();
            if message.contains("already associated") {
                // The connection already carries our app id: good enough.
            } else {
                // Missing (or deprecated) registry: keep going. The bind reports
                // any app-id requirement it needs on its own.
                HOST_APP_REGISTERED.store(false, Ordering::SeqCst);
                eprintln!("[global-shortcut] could not register host app id: {message}");
            }
        }
    }
}

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
        mode: GlobalShortcutMode,
        id: &str,
        trigger: &str,
        description: &str,
        on_activated: ActivatedHandler,
    ) -> Result<RegisterResult, GlobalShortcutError> {
        let id = id.to_owned();
        let trigger = trigger.to_owned();
        let description = description.to_owned();
        let app_id = self.app_id.clone();

        let (sender, receiver) = oneshot::channel();

        // The portal flow is async and long-lived (it owns the session for as
        // long as the shortcut stays bound), so it runs on the Tauri runtime.
        tauri::async_runtime::spawn(async move {
            // The sender is taken by `run` as soon as the bind outcome is
            // known; if it errors before that the receiver reports a failure.
            let mut sender = Some(sender);
            match run(
                app_id,
                id,
                trigger,
                description,
                mode,
                on_activated,
                &mut sender,
            )
            .await
            {
                Ok(()) => {}
                Err(error) => {
                    eprintln!("[global-shortcut] portal backend error: {error}");
                    if let Some(sender) = sender.take() {
                        let _ = sender.send(Err(GlobalShortcutError::Backend(error.to_string())));
                    }
                }
            }
        });

        Ok(receiver)
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
    mode: GlobalShortcutMode,
    on_activated: ActivatedHandler,
    sender: &mut Option<oneshot::Sender<Result<Option<String>, GlobalShortcutError>>>,
) -> Result<(), GlobalShortcutError> {
    register_host_app_once(app_id).await;

    let portal = GlobalShortcuts::new().await.map_err(backend_error)?;

    let session = portal
        .create_session(CreateSessionOptions::default())
        .await
        .map_err(backend_error)?;

    // On KDE `CreateSession` reloads the app's actions from KGlobalAccel, so a
    // shortcut accepted in a previous run already appears here. Treat it as
    // bound when it has a non-empty trigger: an empty trigger means the user
    // removed the key assignment and we should ask again.
    let existing = bound_trigger(&portal, &session, &id).await?;

    // A binding the desktop already knows is *returning*, not new: the portal
    // answers the bind without any dialog, and re-registers the session's
    // actions with KGlobalAccel (`setActions` is the only path that does it,
    // `CreateSession`'s `loadActions` never does). Without this call the
    // component stays inactive (`isActive=false`) and key presses never reach
    // our listener, which is why a working shortcut died on app restart.
    let bound = if existing.is_none() && mode == GlobalShortcutMode::Probe {
        // Probing never asks the user to bind a shortcut that does not exist.
        None
    } else {
        bind_shortcut(&portal, &session, &id, &trigger, &description).await?
    };

    eprintln!(
        "[global-shortcut] {mode:?} -> {}",
        bound.as_deref().unwrap_or("unbound")
    );

    // Report the outcome before listening: the command only waits for this,
    // while the activation loop below lives for the rest of the app run.
    if let Some(sender) = sender.take() {
        let _ = sender.send(Ok(bound.clone()));
    }

    if bound.is_none() {
        return Ok(());
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

/// Returns the trigger currently assigned to `id`, if the desktop already has
/// it bound (either persisted from a previous run or bound in this session).
async fn bind_shortcut(
    portal: &GlobalShortcuts,
    session: &Session<GlobalShortcuts>,
    id: &str,
    trigger: &str,
    description: &str,
) -> Result<Option<String>, GlobalShortcutError> {
    let shortcut =
        NewShortcut::new(id.to_owned(), description.to_owned()).preferred_trigger(trigger);

    // `bind_shortcuts` resolves once the user has interacted with the portal
    // dialog on first use; later binds reuse the stored decision.
    let request = portal
        .bind_shortcuts(session, &[shortcut], None, BindShortcutsOptions::default())
        .await
        .map_err(backend_error)?;

    let response = request.response().map_err(backend_error)?;
    Ok(response
        .shortcuts()
        .iter()
        .find(|shortcut| shortcut.id() == id && !shortcut.trigger_description().is_empty())
        .map(|shortcut| shortcut.trigger_description().to_owned()))
}

async fn bound_trigger(
    portal: &GlobalShortcuts,
    session: &Session<GlobalShortcuts>,
    id: &str,
) -> Result<Option<String>, GlobalShortcutError> {
    let listed = portal
        .list_shortcuts(session, ListShortcutsOptions::default())
        .await
        .map_err(backend_error)?
        .response()
        .map_err(backend_error)?;

    Ok(listed
        .shortcuts()
        .iter()
        .find(|shortcut| shortcut.id() == id && !shortcut.trigger_description().is_empty())
        .map(|shortcut| shortcut.trigger_description().to_owned()))
}

fn backend_error(error: ashpd::Error) -> GlobalShortcutError {
    GlobalShortcutError::Backend(error.to_string())
}
