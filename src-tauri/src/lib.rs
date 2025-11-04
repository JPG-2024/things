mod images;
pub use crate::images::download_images;

mod browser;
pub use crate::browser::init_browser;

/* mod inference_openrouter;
pub use crate::inference_openrouter::inference; */

mod inference_hugging;
pub use crate::inference_hugging::inference;

mod youtube;
pub use crate::youtube::get_youtube_transcript;

mod markdown;
pub use crate::markdown::{extract_blog, extract_markdown, extract_metadata};

use clipboard_master::Master;
mod utils {
    pub mod clipboard;
}
pub use crate::utils::clipboard::Handler;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Load environment variables from .env file
    dotenv::dotenv().ok();

    tauri::Builder::default()
        .setup(|app| {
            tauri::async_runtime::spawn(async move {
                let _ = crate::browser::init_browser().await;
            });

            // Spawn blocking clipboard watcher with access to the AppHandle
            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                let _ = Master::new(Handler::new(app_handle)).run();
            });

            Ok(())
        })
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        // Register the command wrapper here
        .invoke_handler(tauri::generate_handler![
            extract_markdown,
            extract_metadata,
            extract_blog,
            download_images,
            inference,
            get_youtube_transcript
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
