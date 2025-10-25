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
    
    // Esperar a que la página cargue y posibles pop-ups aparezcan
    tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;

    // Intentar cerrar el diálogo de "Iniciar sesión" si existe
    let _ = page.evaluate(r#"
        const buttons = Array.from(document.querySelectorAll('button'));
        const closeButton = buttons.find(btn => btn.textContent.includes('Ahora no') || btn.textContent.includes('Not now'));
        if (closeButton) {
            closeButton.click();
            console.log('Se cerró el pop-up de inicio de sesión.');
        }
    "#).await;
    tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;


    // 1. Encontrar y guardar el elemento scrolleable
    let found_element = page.evaluate(
        r#"
        (() => {
            const main = document.querySelector('main');
            if (!main) {
                console.log('No se encontró elemento <main>');
                return false;
            }
            
            let scrollableElement = null;
            // Prioridad 1: Elemento con overflow explícito
            const elements = main.querySelectorAll('*');
            for (let el of elements) {
                const computedStyle = window.getComputedStyle(el);
                if (computedStyle.overflowY === 'auto' || computedStyle.overflowY === 'scroll') {
                    scrollableElement = el;
                    break;
                }
            }
            
            if (scrollableElement) {
                console.log('Elemento scrolleable encontrado:', scrollableElement);
                window.__scrollableElement = scrollableElement;
                return true;
            }

            window.__scrollableElement.scrollTo({top: 2000, left: 0, behavior: 'auto'})
            
            console.log('No se encontró elemento scrolleable');
            return false;
        })();
        "#,
    ).await?.into_value::<bool>()?;

    if !found_element {
        return Err(anyhow::anyhow!("No se pudo encontrar el contenedor de comentarios para hacer scroll.").into());
    }

    // 2. Bucle de scroll controlado desde Rust
    let max_attempts = 15;
    let max_no_change = 3;
    let mut no_change_count = 0;

    for i in 0..max_attempts {
        let before_height: i64 = page.evaluate("window.__scrollableElement.scrollHeight").await?.into_value()?;
        
        // Hacer scroll
        // page.evaluate("window.__scrollableElement.scrollTop = window.__scrollableElement.scrollHeight").await?;
        let _ = page.evaluate("window.__scrollableElement.scrollTo({top: window.__scrollableElement.scrollHeight, left: 0, behavior: 'auto'})").await?;
        println!("Scroll {}/{} realizado. Altura antes: {}", i + 1, max_attempts, before_height);

        // Esperar a que cargue contenido
        tokio::time::sleep(tokio::time::Duration::from_secs(8)).await;

        
        
        let after_height: i64 = page.evaluate("window.__scrollableElement.scrollHeight").await?.into_value()?;

        println!("Altura después del scroll: {}", after_height);

        if after_height == before_height {
            no_change_count += 1;
            println!("Sin cambios de altura detectados (conteo: {})", no_change_count);
            if no_change_count >= max_no_change {
                println!("No hay más contenido para cargar. Finalizando scroll.");
                break;
            }
        } else {
            no_change_count = 0; // Resetear si hay cambios
            println!("Contenido nuevo detectado. Nueva altura: {}", after_height);
        }
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
            
            // Instagram usa spans para los comentarios.
            // Este selector es más específico para evitar capturar texto no deseado.
            return Array.from(scrollableElement.querySelectorAll('span'))
                .map(el => el.textContent.trim())
                .filter(text => text.length > 5 && !text.includes('Me gusta') && !text.includes('Responder'))
                .filter((text, index, arr) => arr.indexOf(text) === index) // Eliminar duplicados
                .slice(0, 200);
        })();
        "#,
    )
    .await?
    .into_value()?;

    browser.close().await?;
    handle.await?;

    Ok(comments)
}
