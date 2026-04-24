const THUMBNAILS_FOLDER_NAME: &str = "thumbnails";

#[tauri::command]
pub fn url_to_folder_name(_url: &str, _profile: Option<String>) -> String {
    THUMBNAILS_FOLDER_NAME.to_string()
}