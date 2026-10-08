mod youtube;
pub use crate::youtube::{get_youtube_transcript_timed, get_youtube_transcript_timed_text};

mod markdown;
pub use crate::markdown::{extract_blog, extract_markdown, extract_metadata};

mod download_media;
pub use crate::download_media::download_and_save_image;

mod url;
pub use crate::url::url_to_folder_name;

mod web_store;
pub use crate::web_store::{
    assign_categories_to_article, delete_web_profile_template, delete_web_store_article_by_url,
    delete_web_store_category, delete_web_store_domain, delete_web_store_profile,
    delete_web_store_tasks_by_url, delete_web_store_template, fetch_remote_profile,
    filter_existing_article_urls, get_web_profile_template, get_web_store_article_by_url,
    get_web_store_domain, get_web_store_profile, get_web_store_task_chunks,
    get_web_store_tasks_by_url, get_web_store_template, list_articles_by_categories,
    list_articles_without_profile, list_web_store_articles, list_web_store_categories,
    list_web_store_domains, list_web_store_profiles, list_web_store_tasks,
    list_web_store_templates, read_raw_content, read_raw_content_by_url, search_raw_content,
    update_web_store_article_viewed, upsert_web_profile_template, upsert_web_store_article,
    upsert_web_store_category, upsert_web_store_domain, upsert_web_store_profile,
    upsert_web_store_tasks, upsert_web_store_template, write_raw_content,
};

mod audio_capture;
pub use crate::audio_capture::{
    start_system_audio_recording, stop_system_audio_recording, AudioRecorderState,
};

mod embedding_store;
mod llama_server;
mod track_download;
pub use crate::embedding_store::{
    delete_article_embeddings, delete_category_embedding, delete_chunk, delete_chunks_by_article,
    index_chunks, rebuild_category_embeddings, search_similar_categories, search_similar_chunks,
    upsert_category_embeddings,
};
pub use crate::llama_server::{ensure_llama_servers, list_llama_models, llama_defaults};
use crate::llama_server::{stop_llama_servers, LlamaServersState};
pub use crate::track_download::download_track;
mod global_shortcut;
use tauri::Manager;
use tauri::RunEvent;
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    dotenv::dotenv().ok();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .manage(LlamaServersState::default())
        .manage(AudioRecorderState::default())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            global_shortcut::spawn(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_web_store_articles,
            list_web_store_domains,
            get_web_store_domain,
            list_web_store_profiles,
            get_web_store_profile,
            list_articles_without_profile,
            list_articles_by_categories,
            get_web_store_article_by_url,
            filter_existing_article_urls,
            upsert_web_store_article,
            upsert_web_store_domain,
            upsert_web_store_profile,
            fetch_remote_profile,
            delete_web_store_article_by_url,
            update_web_store_article_viewed,
            delete_web_store_domain,
            delete_web_store_profile,
            list_web_store_tasks,
            get_web_store_tasks_by_url,
            get_web_store_task_chunks,
            upsert_web_store_tasks,
            delete_web_store_tasks_by_url,
            write_raw_content,
            read_raw_content,
            search_raw_content,
            list_web_store_categories,
            upsert_web_store_category,
            delete_web_store_category,
            assign_categories_to_article,
            list_web_store_templates,
            get_web_store_template,
            upsert_web_store_template,
            delete_web_store_template,
            get_web_profile_template,
            upsert_web_profile_template,
            delete_web_profile_template,
            extract_markdown,
            extract_metadata,
            extract_blog,
            get_youtube_transcript_timed,
            get_youtube_transcript_timed_text,
            download_and_save_image,
            url_to_folder_name,
            ensure_llama_servers,
            list_llama_models,
            llama_defaults,
            read_clipboard_text,
            index_chunks,
            search_similar_chunks,
            delete_chunks_by_article,
            delete_article_embeddings,
            delete_chunk,
            upsert_category_embeddings,
            search_similar_categories,
            delete_category_embedding,
            rebuild_category_embeddings,
            download_track,
            start_system_audio_recording,
            stop_system_audio_recording,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    let _app_handle = app.handle().clone();

    app.run(|app_handle, event| {
        if let RunEvent::Exit = event {
            let state = app_handle.state::<LlamaServersState>();
            stop_llama_servers(&state);
        }
    });
}
