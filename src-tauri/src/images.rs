use std::path::PathBuf;
use reqwest::Client;
use scraper::{Html, Selector};

/// Estructura para almacenar información de las imágenes
#[derive(Clone, Debug)]
struct ImageInfo {
    url: String,
    width: Option<u32>,
    height: Option<u32>,
    size_bytes: Option<u64>,
}

impl ImageInfo {
    /// Calcula el área basada en dimensiones (width * height)
    fn area(&self) -> u64 {
        match (self.width, self.height) {
            (Some(w), Some(h)) => (w as u64) * (h as u64),
            _ => 0,
        }
    }

    /// Retorna la puntuación: solo considera el área
    fn score(&self) -> u64 {
        self.area()
    }
}


/// Extrae información de las imágenes (URL, width, height)
fn extract_image_srcs(html: &str, base_url: &str) -> Vec<ImageInfo> {
    let document = Html::parse_document(html);
    let img_selector = match Selector::parse("article img") {
        Ok(sel) => sel,
        Err(_) => return Vec::new(),
    };

    document.select(&img_selector)
        .filter_map(|img| {
            img.value().attr("src").map(|src| {
                let full_url = if src.starts_with("http") {
                    src.to_string()
                } else if src.starts_with("/") {
                    match url::Url::parse(base_url) {
                        Ok(parsed_url) => {
                            let base = format!("{}://{}", parsed_url.scheme(), parsed_url.host_str().unwrap_or(""));
                            format!("{}{}", base, src)
                        },
                        Err(_) => src.to_string(),
                    }
                } else {
                    match url::Url::parse(base_url) {
                        Ok(parsed_url) => {
                            let base_path = parsed_url.path().trim_end_matches('/');
                            let base = format!("{}://{}{}/", parsed_url.scheme(), parsed_url.host_str().unwrap_or(""), base_path);
                            format!("{}{}", base, src)
                        },
                        Err(_) => src.to_string(),
                    }
                };

                // Extraer width y height del elemento img
                let width = img.value().attr("width").and_then(|w| w.parse::<u32>().ok());
                let height = img.value().attr("height").and_then(|h| h.parse::<u32>().ok());

                ImageInfo {
                    url: full_url,
                    width,
                    height,
                    size_bytes: None, // Se rellenará después con HEAD request
                }
            })
        })
        .collect()
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

/// Descarga todas las imágenes de una URL y las guarda en el disco
#[tauri::command]
pub async fn download_images(url: String, output_dir: String) -> Result<Vec<String>, String> {
    let page = crate::browser::get_ready_page().await.map_err(|e| e.to_string())?;

    page.goto(&url).await.map_err(|e| e.to_string())?;
    page.wait_for_navigation().await.map_err(|e| e.to_string())?;
    // tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

    let html: String = page.content().await.map_err(|e| e.to_string())?;
    
    // Procesar HTML inmediatamente y extraer información de imágenes
    let mut img_infos = extract_image_srcs(&html, &url);

    // Crear directorio si no existe
    let dir_path = PathBuf::from(&output_dir);
    std::fs::create_dir_all(&dir_path).map_err(|e| format!("Error creating directory: {}", e))?;

    let client = Client::new();

    // Obtener tamaños en bytes para las imágenes que no tienen dimensiones
    for img_info in &mut img_infos {
        if img_info.width.is_none() || img_info.height.is_none() {
            if let Some(size) = get_image_size(&client, &img_info.url).await {
                img_info.size_bytes = Some(size);
                println!("📊 Tamaño de {}: {} bytes", img_info.url, size);
            }
        } else {
            println!("📐 Dimensiones de {}: {}x{}", img_info.url, img_info.width.unwrap_or(0), img_info.height.unwrap_or(0));
        }
    }

    // Filtrar imágenes que superen dimensiones mínimas (excluyendo thumbnails y aside)
    const MIN_WIDTH: u32 = 300;
    const MIN_HEIGHT: u32 = 300;
    const MIN_AREA: u64 = (MIN_WIDTH as u64) * (MIN_HEIGHT as u64);

    let filtered_images: Vec<ImageInfo> = img_infos.into_iter()
        .filter(|img| {
            match (img.width, img.height) {
                (Some(w), Some(h)) => {
                    let area = (w as u64) * (h as u64);
                    area >= MIN_AREA
                },
                _ => false,
            }
        })
        .collect();

    if filtered_images.is_empty() {
        return Err("❌ No se encontraron imágenes con dimensiones mínimas requeridas".to_string());
    }

    // Ordenar por puntuación (área) descendente
    let mut sorted_images = filtered_images;
    sorted_images.sort_by(|a, b| b.score().cmp(&a.score()));

    let mut saved_paths = Vec::new();

    for img in sorted_images {
        println!("⭐ Procesando imagen: {} (score: {})", img.url, img.score());
        
        // Extraer nombre del archivo
        let filename = img.url.split('/').last().unwrap_or("").to_string();
        // Remover query string
        let filename = filename.split('?').next().unwrap_or("").to_string();
        let filename = if filename.is_empty() {
            format!("image_{}.jpg", saved_paths.len() + 1)
        } else {
            filename
        };
        let file_path = dir_path.join(&filename);

        println!("Descargando imagen: {}", img.url);

        match client.get(&img.url).send().await {
            Ok(response) => {
                match response.bytes().await {
                    Ok(bytes) => {
                        match std::fs::write(&file_path, bytes) {
                            Ok(_) => {
                                let relative_path = file_path.to_string_lossy().to_string();
                                println!("✅ Imagen guardada: {:?}", file_path);
                                saved_paths.push(relative_path);
                            },
                            Err(e) => println!("❌ Error escribiendo archivo: {}", e),
                        }
                    },
                    Err(e) => println!("❌ Error leyendo respuesta: {}", e),
                }
            },
            Err(e) => println!("❌ Error descargando imagen: {}", e),
        }
    }

    if !saved_paths.is_empty() {
        Ok(saved_paths)
    } else {
        Err("❌ No se encontraron imágenes para descargar".to_string())
    }
}