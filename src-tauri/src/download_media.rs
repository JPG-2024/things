use image::imageops::FilterType;
use sha2::{Sha256, Digest};
use tauri::AppHandle;
use tauri::Manager;
use tauri_plugin_http::reqwest;
use webp::Encoder;

fn hex_encode(bytes: impl AsRef<[u8]>) -> String {
    bytes.as_ref().iter().map(|b| format!("{:02x}", b)).collect()
}

/// Downloads an image from a URL and saves it locally to the app's local data directory
///
/// # Arguments
/// * `app` - The Tauri application handle
/// * `url` - The URL of the image to download
///
/// # Returns
/// * `Ok(String)` - The filename of the saved image
/// * `Err(String)` - Error message if the download or save fails
#[tauri::command]
pub async fn download_and_save_image(
    app: AppHandle,
    url: String,
    folder_name: String,
    reduction_magnitud: u32,
) -> Result<String, String> {
    // Validate URL is not empty
    if url.is_empty() {
        return Ok(String::new());
    }

    if reduction_magnitud == 0 {
        return Err(String::from("reduction_magnitud must be greater than 0"));
    }

    // Get the app's local data directory
    let app_local_data = app.path().app_local_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    let media_dir = app_local_data.join("media").join(&folder_name);

    // Generate a deterministic filename from the URL hash
    let mut hasher = Sha256::new();
    hasher.update(url.as_bytes());
    let hash = hex_encode(hasher.finalize());
    let filename = format!("{}.webp", &hash[..16]);

    // Skip download if file already exists
    let filepath = media_dir.join(&filename);
    if filepath.exists() {
        println!("[Image] File already exists, skipping download: {}", filename);
        return Ok(filename);
    }

    println!("[Image] Saving image to folder: media/{}", app_local_data.join("media").join(&folder_name).display());

    // Create the thumbs directory if it doesn't exist
    std::fs::create_dir_all(&media_dir)
        .map_err(|e| format!("Failed to create media directory: {}", e))?;

    println!("[Image] Downloading image from: {}", url);

    // Download the image using reqwest
    let response = reqwest::get(&url)
        .await
        .map_err(|e| format!("Failed to download image: {}", e))?;

    // Check if the response status is successful
    if !response.status().is_success() {
        return Err(format!("Failed to download image: HTTP {}", response.status()));
    }

    // Get the image bytes
    let bytes = response.bytes()
        .await
        .map_err(|e| format!("Failed to read image data: {}", e))?;

    let image = image::load_from_memory(&bytes)
        .map_err(|e| format!("Failed to decode image: {}", e))?;

    let resized_image = image.resize_exact(
        (image.width() / reduction_magnitud).max(1),
        (image.height() / reduction_magnitud).max(1),
        FilterType::Lanczos3,
    );

    let webp_data = Encoder::from_image(&resized_image)
        .map_err(|e| format!("Failed to create WebP encoder: {}", e))?
        .encode(80.0);
    std::fs::write(&filepath, &*webp_data)
        .map_err(|e| format!("Failed to save WebP image: {}", e))?;

    println!("[Image] Successfully saved image to: media/{}", filename);

    Ok(filename)
}
