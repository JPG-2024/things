mod images;
pub use crate::images::download_images;

mod browser;
pub use crate::browser::init_browser;

mod inference_openrouter;
pub use crate::inference_openrouter::{inference};

mod youtube;
pub use crate::youtube::{get_youtube_transcript}; 

mod markdown;
pub use crate::markdown::{extract_markdown};


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Load environment variables from .env file
    dotenv::dotenv().ok();

    tauri::Builder::default()
        .setup(|_app| {
            tauri::async_runtime::spawn(async move {
                let _ = crate::browser::init_browser().await;
            });
            Ok(())
        })
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        // Register the command wrapper here
        .invoke_handler(tauri::generate_handler![
            extract_markdown,
            download_images,
            inference,
            get_youtube_transcript
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
