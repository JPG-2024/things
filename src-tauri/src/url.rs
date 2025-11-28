use sha2::{Sha256, Digest};

#[tauri::command]
pub fn url_to_folder_name(url: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(url.as_bytes());
    let result = hasher.finalize();
    format!("{:x}", result)[..16].to_string()
}

// Ejemplo: "https://example.com/article" -> "a1b2c3d4e5f6g7h8"