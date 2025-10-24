use chromiumoxide::browser::{Browser, BrowserConfig};
use chromiumoxide::cdp::browser_protocol::emulation::SetUserAgentOverrideParams;
use chromiumoxide::cdp::browser_protocol::network::SetUserAgentOverrideParams as NetworkSetUserAgentOverrideParams;
use futures::StreamExt;
use anyhow::Result;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// Extrae el contenido de una URL usando Chrome local y lo convierte a Markdown
/// Aplica técnicas anti-detección de bots
#[tauri::command]
async fn extract_url_to_markdown(url: String) -> Result<String, String> {
    extract_content_to_markdown(&url)
        .await
        .map_err(|e| e.to_string())
}

/// Función principal que extrae contenido de una URL y lo convierte a Markdown
async fn extract_content_to_markdown(url: &str) -> Result<String> {
    // Ruta del Chrome local en macOS
    let chrome_path = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    
    // Configuración del navegador con técnicas anti-detección
    let config = BrowserConfig::builder()
        .chrome_executable(chrome_path) // Usar Chrome local instalado
        .disable_default_args() // Deshabilitar argumentos por defecto
        .args(vec![
            // Técnicas anti-detección
            "--disable-blink-features=AutomationControlled", // Ocultar que es automatizado
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-web-security",
            "--disable-features=IsolateOrigins,site-per-process",
            "--disable-infobars",
            "--window-size=1920,1080",
            "--start-maximized",
            // Simular un navegador real
            "--disable-blink-features=AutomationControlled",
            "--exclude-switches=enable-automation",
            "--disable-extensions",
            "--profile-directory=Default",
            "--incognito=false",
        ])
        .build()
        .map_err(|e| anyhow::anyhow!(e))?;

    // Lanzar el navegador
    let (mut browser, mut handler) = Browser::launch(config).await?;

    // Spawn task para manejar el websocket
    let handle = tokio::spawn(async move {
        while let Some(h) = handler.next().await {
            if h.is_err() {
                break;
            }
        }
    });

    // Crear nueva página
    let page = browser.new_page("about:blank").await?;

    // Aplicar más técnicas anti-detección
    // 1. User Agent realista
    let user_agent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    
    page.execute(chromiumoxide::cdp::browser_protocol::emulation::SetUserAgentOverrideParams {
        user_agent: user_agent.to_string(),
        accept_language: Some("es-ES,es;q=0.9,en;q=0.8".to_string()),
        platform: Some("MacIntel".to_string()),
        user_agent_metadata: None,
    })
    .await?;

    // 2. Eliminar señales de webdriver
    page.evaluate(
        r#"
        // Eliminar navigator.webdriver
        Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined
        });
        
        // Sobrescribir plugins
        Object.defineProperty(navigator, 'plugins', {
            get: () => [1, 2, 3, 4, 5]
        });
        
        // Sobrescribir languages
        Object.defineProperty(navigator, 'languages', {
            get: () => ['es-ES', 'es', 'en']
        });
        
        // Chrome property
        window.chrome = {
            runtime: {}
        };
        
        // Permissions
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) => (
            parameters.name === 'notifications' ?
                Promise.resolve({ state: Notification.permission }) :
                originalQuery(parameters)
        );
        "#,
    )
    .await?;

    // 3. Navegar a la URL
    page.goto(url).await?;

    // 4. Esperar a que la página cargue completamente
    page.wait_for_navigation().await?;
    
    // Esperar un poco más para asegurar que todo el contenido dinámico se cargue
    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

    // 5. Extraer el HTML
    let html = page.content().await?;

    // 6. Convertir HTML a Markdown
    let markdown = html2md::parse_html(&html);

    // Cerrar el navegador
    browser.close().await?;
    handle.await?;

    Ok(markdown)
}

#[tauri::command]
async fn extract_youtube_comments(url: String) -> Result<Vec<String>, String> {
    extract_comments_from_youtube(&url)
        .await
        .map_err(|e| e.to_string())
}

/// Extrae comentarios de un video de YouTube
async fn extract_comments_from_youtube(url: &str) -> Result<Vec<String>> {
    let chrome_path = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    
    let config = BrowserConfig::builder()
        .chrome_executable(chrome_path)
        .disable_default_args()
        .args(vec![
            "--disable-blink-features=AutomationControlled",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-web-security",
            "--disable-features=IsolateOrigins,site-per-process",
            "--window-size=1920,1080",
            "--start-maximized",
        ])
        .build()
        .map_err(|e| anyhow::anyhow!(e))?;

    let (mut browser, mut handler) = Browser::launch(config).await?;

    let handle = tokio::spawn(async move {
        while let Some(h) = handler.next().await {
            if h.is_err() {
                break;
            }
        }
    });

    let page = browser.new_page("about:blank").await?;

    let user_agent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    
    page.execute(chromiumoxide::cdp::browser_protocol::emulation::SetUserAgentOverrideParams {
        user_agent: user_agent.to_string(),
        accept_language: Some("es-ES,es;q=0.9,en;q=0.8".to_string()),
        platform: Some("MacIntel".to_string()),
        user_agent_metadata: None,
    })
    .await?;

    // Anti-detección
    page.evaluate(
        r#"
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        window.chrome = { runtime: {} };
        "#,
    )
    .await?;

    // Navegar al video
    page.goto(url).await?;
    page.wait_for_navigation().await?;
    
    // Esperar a que carguen los comentarios iniciales
    tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;

    // Scroll para cargar más comentarios - MEJORADO
    let pages_to_load = 5; // Número de "páginas" a cargar
    
    for page_num in 0..pages_to_load {
        println!("Cargando página {} de comentarios...", page_num + 1);
        
        // Script para hacer scroll al final y cargar más comentarios
        page.evaluate(
            r#"
            (async () => {
                const scrollDelay = 1000;
                const scrollAttempts = 10;
                
                for (let i = 0; i < scrollAttempts; i++) {
                    // Scroll al final del documento
                    window.scrollTo(0, document.documentElement.scrollHeight);
                    await new Promise(resolve => setTimeout(resolve, scrollDelay));
                }
            })();
            "#,
        )
        .await?;
        
        // Esperar a que carguen nuevos comentarios
        tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
    }

    // Extraer todos los comentarios cargados
    let comments: Vec<String> = page.evaluate(
        r#"
        Array.from(document.querySelectorAll('#content-text'))
            .map(el => el.textContent.trim())
            .filter(text => text.length > 10)  // Filtrar textos muy cortos
            .slice(0, 200)  // Limitar a 200 comentarios
        "#,
    )
    .await?
    .into_value()?;

    browser.close().await?;
    handle.await?;

    Ok(comments)
}

#[tauri::command]
async fn extract_instagram_comments(url: String) -> Result<Vec<String>, String> {
    extract_comments_from_instagram(&url)
        .await
        .map_err(|e| e.to_string())
}

/// Extrae comentarios de Instagram detectando el elemento scrolleable dentro de <main>
async fn extract_comments_from_instagram(url: &str) -> Result<Vec<String>> {
    let chrome_path = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    
    let config = BrowserConfig::builder()
        .chrome_executable(chrome_path)
        .disable_default_args()
        .args(vec![
            "--disable-blink-features=AutomationControlled",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-web-security",
            "--disable-features=IsolateOrigins,site-per-process",
            "--window-size=1920,1080",
            "--start-maximized",
        ])
        .build()
        .map_err(|e| anyhow::anyhow!(e))?;

    let (mut browser, mut handler) = Browser::launch(config).await?;

    let handle = tokio::spawn(async move {
        while let Some(h) = handler.next().await {
            if h.is_err() {
                break;
            }
        }
    });

    let page = browser.new_page("about:blank").await?;

    let user_agent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    
    page.execute(chromiumoxide::cdp::browser_protocol::emulation::SetUserAgentOverrideParams {
        user_agent: user_agent.to_string(),
        accept_language: Some("es-ES,es;q=0.9,en;q=0.8".to_string()),
        platform: Some("MacIntel".to_string()),
        user_agent_metadata: None,
    })
    .await?;

    // Anti-detección
    page.evaluate(
        r#"
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        window.chrome = { runtime: {} };
        "#,
    )
    .await?;

    // Navegar al post
    page.goto(url).await?;
    page.wait_for_navigation().await?;
    
    // Esperar a que carguen los comentarios iniciales
    tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;

    // Detectar el elemento scrolleable dentro de <main> y hacer scroll
    for page_num in 0..20 {
        println!("Cargando página {} de comentarios de Instagram...", page_num + 1);
        
        // Script para detectar el elemento scrolleable y hacer scroll hasta que no haya cambios
        page.evaluate(
            r#"
            (async () => {
                const main = document.querySelector('main');
                if (!main) {
                    console.log('No se encontró elemento <main>');
                }
                
                // Buscar el elemento scrolleable
                let scrollableElement = null;
                const elements = main.querySelectorAll('*');
                
                for (let el of elements) {
                    const computedStyle = window.getComputedStyle(el);
                    const overflowY = computedStyle.overflowY;

                    if ((overflowY === 'auto' || overflowY === 'scroll')) {
                        scrollableElement = el;
                        console.log('Elemento scrolleable encontrado:', el);
                        break;
                    }
                }
                
                if (!scrollableElement) {
                    for (let el of elements) {
                        if (el.scrollHeight > el.clientHeight && el.clientHeight > 0) {
                            scrollableElement = el;
                            break;
                        }
                    }
                }
                
                if (!scrollableElement) {
                    console.log('No se encontró elemento scrolleable');
                }
                
                window.__scrollableElement = scrollableElement;
                
                // Scroll inteligente: detectar cuándo no hay más cambios en el DOM
                let previousHeight = scrollableElement.scrollHeight;
                let noChangeCount = 0;
                const maxNoChangeIterations = 3; // Si no cambia 3 veces seguidas, parar
                const maxAttempts = 15;
                
                for (let i = 0; i < maxAttempts; i++) {
                    const beforeHeight = scrollableElement.scrollHeight;
                    
                    // Hacer scroll
                    scrollableElement.scrollTop = scrollableElement.scrollHeight;
                    console.log('Scroll realizado. Altura antes:', beforeHeight);
                    
                    // Esperar a que cargue contenido
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    const afterHeight = scrollableElement.scrollHeight;
                    
                    // Si la altura no cambió, incrementar contador
                    if (afterHeight === beforeHeight) {
                        noChangeCount++;
                        console.log('Sin cambios detectados:', noChangeCount);
                        
                        if (noChangeCount >= maxNoChangeIterations) {
                            console.log('No hay más contenido para cargar');
                            break;
                        }
                    } else {
                        noChangeCount = 0; // Reset si hay cambios
                        console.log('Contenido nuevo detectado. Altura anterior:', beforeHeight, 'Nueva altura:', afterHeight);
                    }
                }
            })();
            "#,
        )
        .await?;
        
        // Pequeña pausa entre iteraciones
        tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
    }

    // Extraer todos los comentarios del scrollableElement guardado
    let comments: Vec<String> = page.evaluate(
        r#"
        (() => {
            const scrollableElement = window.__scrollableElement;
            if (!scrollableElement) {
                console.log('No hay elemento scrolleable guardado');
                return [];
            }
            
            return Array.from(scrollableElement.querySelectorAll('span'))
                .map(el => el.textContent.trim())
                .filter(text => text.length > 10)
                .filter((text, index, arr) => arr.indexOf(text) === index)
                .slice(0, 200)
        })();
        "#,
    )
    .await?
    .into_value()?;

    browser.close().await?;
    handle.await?;

    Ok(comments)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, extract_url_to_markdown, extract_youtube_comments, extract_instagram_comments])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
