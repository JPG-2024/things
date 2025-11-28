/* use tauri::AppHandle;
use tauri::Manager;
use tauri_plugin_http::reqwest;
use uuid::Uuid;

/// Downloads multiple images from URLs and saves them locally to the app's local data directory
///
/// # Arguments
/// * `app` - The Tauri application handle
/// * `urls` - A vector of URLs of images to download
/// * `folder_name` - The folder name where to save the images
///
/// # Returns
/// * `Ok(Vec<String>)` - A vector of filenames of the saved images
/// * `Err(String)` - Error message if the download or save fails
#[tauri::command]
pub async fn download_and_save_image(
    app: AppHandle,
    urls: Vec<String>,
    folder_name: String,
) -> Result<Vec<String>, String> {
    // Validate URLs vector is not empty
    if urls.is_empty() {
        return Ok(Vec::new());
    }

    // Get the app's local data directory
    let app_local_data = app.path().app_local_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    // Create the media directory if it doesn't exist
    let media_dir = app_local_data.join("media").join(&folder_name);
    std::fs::create_dir_all(&media_dir)
        .map_err(|e| format!("Failed to create media directory: {}", e))?;

    let mut filenames = Vec::new();

    // Download and save each image
    for url in urls {
        // Skip empty URLs
        if url.is_empty() {
            continue;
        }

        println!("[Image] Downloading image from: {}", url);

        // Download the image using reqwest
        let response = match reqwest::get(&url).await {
            Ok(resp) => resp,
            Err(e) => {
                eprintln!("[Image] Failed to download image from {}: {}", url, e);
                continue;
            }
        };

        // Check if the response status is successful
        if !response.status().is_success() {
            eprintln!("[Image] Failed to download image from {}: HTTP {}", url, response.status());
            continue;
        }

        // Get the image bytes
        let bytes = match response.bytes().await {
            Ok(b) => b,
            Err(e) => {
                eprintln!("[Image] Failed to read image data from {}: {}", url, e);
                continue;
            }
        };

        // Generate a unique filename using UUID
        let filename = format!("{}.jpg", Uuid::new_v4());

        // Write the image file
        let filepath = media_dir.join(&filename);
        match std::fs::write(&filepath, bytes) {
            Ok(_) => {
                println!("[Image] Successfully saved image to: media/{}/{}", folder_name, filename);
                filenames.push(filename);
            }
            Err(e) => {
                eprintln!("[Image] Failed to save image: {}", e);
                continue;
            }
        }
    }

    Ok(filenames)
}
 */