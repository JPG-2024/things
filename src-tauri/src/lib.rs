mod browser;
pub use crate::browser::init_browser;

/* mod inference_openrouter;
pub use crate::inference_openrouter::inference; */

/* mod inference_hugging;
pub use crate::inference_hugging::inference; */

mod youtube;
pub use crate::youtube::{
    get_video_info,
    get_youtube_transcript_timed,
    get_youtube_transcript_timed_text,
    search_youtube,
};

mod youtube_info;
pub use crate::youtube_info::get_youtube_info;

mod splitter;
pub use crate::splitter::{split_text, split_text_command, SplitMode};

mod markdown;
pub use crate::markdown::{extract_blog, extract_markdown, extract_metadata};

mod download_media;
pub use crate::download_media::download_and_save_image;

mod url;
pub use crate::url::url_to_folder_name;

mod llama_server;
pub use crate::llama_server::launch_llama_server;
use crate::llama_server::{stop_llama_server, LlamaServerState};


mod tts_helpers;

mod tts;
pub use crate::tts::{synthesize_speech, synthesize_speech_batch, cleanup_tts_file, play_tts_file, stop_tts_playback};

mod migrations;
pub use crate::migrations::get_migrations;
use tauri::RunEvent;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Load environment variables from .env file
    dotenv::dotenv().ok();

    let migrations = get_migrations();

    let app = tauri::Builder::default()
        .manage(LlamaServerState::default())
        .plugin(
            // Build the SQL plugin
            tauri_plugin_sql::Builder::default()
                // Add migrations to the 'notian.db' database
                .add_migrations("sqlite:notian.db", migrations)
                .build(),
        )
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
            extract_metadata,
            extract_blog,
            get_video_info,
            get_youtube_info,
            get_youtube_transcript_timed,
            get_youtube_transcript_timed_text,
            search_youtube,
            download_and_save_image,
            url_to_folder_name,
            launch_llama_server,
            split_text_command,
            synthesize_speech,
            synthesize_speech_batch,
            cleanup_tts_file,
            play_tts_file,
            stop_tts_playback
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let RunEvent::Exit = event {
            let state = app_handle.state::<LlamaServerState>();
            stop_llama_server(&state);
        }
    });
}
