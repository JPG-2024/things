/* use clipboard_master::{CallbackResult, ClipboardHandler};
use std::io;
use tauri::Emitter; // Tauri v2: Emitter trait provides `.emit`

// 1. Añade el AppHandle al struct
pub struct Handler {
    app_handle: tauri::AppHandle,
}

impl Handler {
    pub fn new(app_handle: tauri::AppHandle) -> Self {
        Self { app_handle }
    }
}

// 2. Implementa el trait
impl ClipboardHandler for Handler {
    fn on_clipboard_change(&mut self) -> CallbackResult {
        // Lee el texto del clipboard
        let mut clipboard = arboard::Clipboard::new().unwrap();
        let text = clipboard.get_text().unwrap_or_else(|_| "".into());
        print!(
            "Clipboard change happened! Emitting event with text: {}",
            text
        );
        // Emite evento al frontend con solo el texto
        self.app_handle
            .emit("clipboard-changed", text.clone())
            .unwrap();

        CallbackResult::Next
    }

    fn on_clipboard_error(&mut self, error: io::Error) -> CallbackResult {
        eprintln!("Error: {}", error);
        CallbackResult::Next
    }
}
 */