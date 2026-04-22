mod browser;
pub use crate::browser::init_browser;

/* mod inference_openrouter;
pub use crate::inference_openrouter::inference; */

/* mod inference_hugging;
pub use crate::inference_hugging::inference; */

mod youtube;
pub use crate::youtube::{
    get_page_elements,
    get_youtube_transcript_timed,
    get_youtube_transcript_timed_text,
    search_youtube,
};

mod youtube_info;
pub use crate::youtube_info::{extract_chapters};

mod splitter;
pub use crate::splitter::{split_text, split_text_command, SplitMode};

mod markdown;
pub use crate::markdown::{extract_blog, extract_markdown, extract_metadata};

mod download_media;
pub use crate::download_media::download_and_save_image;

mod url;
pub use crate::url::url_to_folder_name;

mod article_store;
pub use crate::article_store::{
    delete_stored_article_by_url,
    get_stored_article_by_url,
    list_stored_article_profiles,
    list_stored_articles_by_profile,
    list_stored_articles,
    upsert_stored_article,
};

mod llama_server;
pub use crate::llama_server::launch_llama_server;
use crate::llama_server::{stop_llama_server, LlamaServerState};


mod tts_helpers;

mod tts;
pub use crate::tts::{synthesize_speech, synthesize_speech_batch, cleanup_tts_file, play_tts_file, stop_tts_playback};
use tauri::RunEvent;
use tauri::Manager;
use tauri_plugin_clipboard_manager::ClipboardExt;

#[tauri::command]
async fn read_clipboard_text(app: tauri::AppHandle) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        app.clipboard()
            .read_text()
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

fn cleanup_legacy_sqlite_files(app: &tauri::AppHandle) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&app_data_dir).map_err(|error| error.to_string())?;

    for file_name in [
        "notian.db",
        "notian.db-shm",
        "notian.db-wal",
        "notian.db-journal",
    ] {
        let path = app_data_dir.join(file_name);

        match std::fs::remove_file(&path) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.to_string()),
        }
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Load environment variables from .env file
    dotenv::dotenv().ok();

    let app = tauri::Builder::default()
        .manage(LlamaServerState::default())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        // Register the command wrapper here
        .invoke_handler(tauri::generate_handler![
            list_stored_articles,
            list_stored_article_profiles,
            list_stored_articles_by_profile,
            get_stored_article_by_url,
            upsert_stored_article,
            delete_stored_article_by_url,
            extract_markdown,
            extract_metadata,
            extract_blog,
            get_page_elements,
            extract_chapters,
            get_youtube_transcript_timed,
            get_youtube_transcript_timed_text,
            search_youtube,
            download_and_save_image,
            url_to_folder_name,
            launch_llama_server,
            split_text_command,
            read_clipboard_text,
            synthesize_speech,
            synthesize_speech_batch,
            cleanup_tts_file,
            play_tts_file,
            stop_tts_playback
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    let app_handle = app.handle().clone();
    if let Err(error) = cleanup_legacy_sqlite_files(&app_handle) {
        eprintln!("Unable to remove legacy SQLite files: {error}");
    }

    app.run(|app_handle, event| {
        if let RunEvent::Exit = event {
            let _ = tauri::async_runtime::block_on(crate::browser::shutdown_browser());
            let state = app_handle.state::<LlamaServerState>();
            stop_llama_server(&state);
        }
    });
}
