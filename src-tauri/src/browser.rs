//! Shared Chromium slot for the scrapers.
//!
//! Both the YouTube scraper and the web-article fallback drive the same
//! in-process Chromium (`rustwright`). One browser per process: the engine is
//! expensive to start and a second instance wastes hundreds of MB, so every
//! command shares this slot.
//!
//! `rustwright` is synchronous and busy for seconds at a time; callers run it
//! inside `spawn_blocking`. This module only owns the lazily launched browser
//! plus the navigation helpers both scrapers share.

use std::sync::{Arc, Mutex};

use rustwright::{chromium, Browser, GotoOptions, LaunchOptions, Page};

/// Lazily launched Chromium shared by every scrape command.
#[derive(Clone, Default)]
pub struct BrowserState {
    inner: Arc<BrowserSlot>,
}

#[derive(Default)]
struct BrowserSlot {
    browser: Mutex<Option<Browser>>,
    executable_path: Mutex<Option<String>>,
}

/// Why a navigation failed. Callers map it to their own error vocabulary
/// (`timed_out` lets the article fallback report a browser timeout).
pub struct NavigateError {
    pub message: String,
    pub timed_out: bool,
}

impl BrowserState {
    /// Chromium path the next launch will use, if one was configured.
    pub fn executable_path(&self) -> Option<String> {
        self.inner
            .executable_path
            .lock()
            .ok()
            .and_then(|path| path.clone())
    }

    /// Stores the Chromium path the next launch should use. A running browser
    /// keeps the old binary, so it is closed when the path actually changes.
    pub fn set_executable_path(&self, path: Option<String>) -> Result<(), String> {
        let normalized = path
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());

        let changed = {
            let mut current = self
                .inner
                .executable_path
                .lock()
                .map_err(|_| "browser state poisoned".to_string())?;
            let changed = *current != normalized;
            *current = normalized;
            changed
        };

        if changed {
            self.close_browser();
        }

        Ok(())
    }

    /// Returns the shared browser, launching it on first use or after a crash.
    pub fn browser(&self) -> Result<Browser, String> {
        let mut slot = self
            .inner
            .browser
            .lock()
            .map_err(|_| "browser state poisoned".to_string())?;

        if let Some(browser) = slot.as_ref() {
            if browser.is_connected() {
                return Ok(browser.clone());
            }
        }

        let options = LaunchOptions {
            headless: Some(true),
            chromium_sandbox: false,
            executable_path: self.executable_path(),
            args: vec!["--no-sandbox".into(), "--disable-dev-shm-usage".into()],
            ..LaunchOptions::default()
        };

        let browser = chromium().launch(options).map_err(|error| {
            format!(
                "Chromium launch failed: {error}. Install Chromium/Chrome or set its path in Settings → Scraping."
            )
        })?;

        *slot = Some(browser.clone());
        Ok(browser)
    }

    /// Whether a Chromium binary is available to launch (configured path or
    /// system discovery). Never launches anything.
    pub fn is_available(&self) -> bool {
        match self.executable_path() {
            Some(path) => std::path::Path::new(&path).is_file(),
            None => chromium().executable_path().is_some(),
        }
    }

    /// Closes the browser this app launched, if any. Safe to call on exit.
    pub fn close_browser(&self) {
        if let Ok(mut slot) = self.inner.browser.lock() {
            if let Some(browser) = slot.take() {
                let _ = browser.close();
            }
        }
    }
}

pub fn open_page(browser: &Browser) -> Result<Page, String> {
    browser
        .new_page()
        .map_err(|error| format!("Could not open a browser page: {error}"))
}

/// Navigates and fails on an HTTP error status, exactly like the scraper
/// service did (`>= 400` is a failure even when Chromium rendered the page).
pub fn navigate(page: &Page, url: &str, options: GotoOptions) -> Result<(), NavigateError> {
    let response = page.goto(url, options).map_err(|error| {
        let timed_out = matches!(error, rustwright::Error::Timeout(_));
        NavigateError {
            message: if timed_out {
                format!("Navigation timed out: {url}")
            } else {
                format!("Navigation failed for {url}: {error}")
            },
            timed_out,
        }
    })?;

    // rustwright returns the response metadata: only the status matters here.
    if let Some(status) = response.get("status").and_then(|value| value.as_u64()) {
        if status >= 400 {
            return Err(NavigateError {
                message: format!("Navigation failed with status {status} for {url}"),
                timed_out: false,
            });
        }
    }

    Ok(())
}
