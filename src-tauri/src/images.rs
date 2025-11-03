use reqwest::Client;
use scraper::{Html, Selector};
use serde::Serialize;
use tauri::Emitter;

/// Estructura para emitir evento de imágenes guardadas
#[derive(Debug, Serialize, Clone)]
pub struct ImagesSavedEvent {
    pub paths: Vec<String>,
}

/// Extrae la URL de la imagen del meta tag og:image:url o og:image
fn extract_og_image(html: &str) -> Option<String> {
    let document = Html::parse_document(html);

    // Intentar primero con og:image:url
    let meta_selector_url = match Selector::parse("meta[property=\"og:image:url\"]") {
        Ok(sel) => sel,
        Err(_) => return None,
    };

    if let Some(url) = document.select(&meta_selector_url)
        .next()
        .and_then(|meta| meta.value().attr("content"))
        .map(|url| url.to_string()) {
        return Some(url);
    }

    // Si no encuentra og:image:url, intentar con og:image
    let meta_selector = match Selector::parse("meta[property=\"og:image\"]") {
        Ok(sel) => sel,
        Err(_) => return None,
    };

    document.select(&meta_selector)
        .next()
        .and_then(|meta| meta.value().attr("content"))
        .map(|url| url.to_string())
}

/// Obtiene el tamaño de la imagen en bytes usando HEAD request
async fn get_image_size(client: &Client, url: &str) -> Option<u64> {
    match client.head(url).send().await {
        Ok(response) => {
            response.headers()
                .get("content-length")
                .and_then(|h| h.to_str().ok())
                .and_then(|s| s.parse::<u64>().ok())
        },
        Err(_) => None,
    }
}

/// Descarga la imagen de og:image:url y la guarda en el disco
#[tauri::command]
pub async fn download_images(app: tauri::AppHandle, url: String) -> Result<Vec<String>, String> {
    app.emit("flow-status", "images - opening tab...")
        .map_err(|e| format!("Failed to emit flow-status event: {}", e))?;

    let page = crate::browser::get_ready_page().await.map_err(|e| e.to_string())?;

    page.goto(&url).await.map_err(|e| e.to_string())?;
    page.wait_for_navigation().await.map_err(|e| e.to_string())?;

    app.emit("flow-status", "images - extracting image...")
        .map_err(|e| format!("Failed to emit flow-status event: {}", e))?;

    let html: String = page.content().await.map_err(|e| e.to_string())?;
    
    // Extraer imagen del meta tag og:image:url o og:image
    let image_url = extract_og_image(&html)
        .ok_or("❌ No se encontró og:image:url en la página")?;

    println!("✅ Imagen encontrada: {}", image_url);

    // Crear directorio en ~/notian/images
    let home_dir = dirs::home_dir().ok_or("No se pudo obtener la carpeta personal del usuario")?;
    let dir_path = home_dir.join("notian/images");
    std::fs::create_dir_all(&dir_path).map_err(|e| format!("Error creando directorio: {}", e))?;

    let client = Client::new();

    // Obtener tamaño de la imagen
    if let Some(size) = get_image_size(&client, &image_url).await {
        println!("📊 Tamaño de imagen: {} bytes", size);
    }

    // Extraer nombre del archivo
    let filename = image_url.split('/').next_back().unwrap_or("image.jpg").to_string();
    let filename = filename.split('?').next().unwrap_or("image.jpg").to_string();
    let file_path = dir_path.join(&filename);

    println!("⭐ Descargando imagen: {}", image_url);

    match client.get(&image_url).send().await {
        Ok(response) => {
            match response.bytes().await {
                Ok(bytes) => {
                    match std::fs::write(&file_path, bytes) {
                        Ok(_) => {
                            let relative_path = file_path.to_string_lossy().to_string();
                            println!("✅ Imagen guardada: {:?}", file_path);
                            
                            let event = ImagesSavedEvent {
                                paths: vec![relative_path.clone()],
                            };
                            app.emit("images-saved", event)
                                .map_err(|e| format!("Failed to emit images-saved event: {}", e))?;
                            Ok(vec![relative_path])
                        },
                        Err(e) => Err(format!("❌ Error escribiendo archivo: {}", e)),
                    }
                },
                Err(e) => Err(format!("❌ Error leyendo respuesta: {}", e)),
            }
        },
        Err(e) => Err(format!("❌ Error descargando imagen: {}", e)),
    }
}