//! Web article extraction, in-process.
//!
//! Port of the external scraper service's `/api/article` path (markdown,
//! `render: "auto"`): static fetch first, headless-browser fallback when the
//! fetch fails or the extraction is too short, then Readability in Rust
//! (`readabilityrs`) instead of `defuddle`.
//!
//! Every arbitrary URL goes through [`require_public_url`] and
//! [`assert_public_host`]: the app fetches client-supplied URLs, so private,
//! loopback and link-local hosts are refused on every redirect hop of the
//! static fetch, and on the page the browser fallback actually landed on.
//! Residual: the browser itself does issue the request to a redirect target —
//! the post-navigation check keeps its content from being extracted and
//! returned, but the request is not prevented.

use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, ToSocketAddrs};
use std::time::Duration;

use rustwright::{ActionOptions, GotoOptions};
use serde::{Deserialize, Serialize};
use url::Url;

use crate::browser::{navigate, open_page, BrowserState};

/// Static fetch budget.
const FETCH_TIMEOUT: Duration = Duration::from_millis(8000);
const MAX_REDIRECTS: usize = 5;
/// Browser navigation budget.
const BROWSER_TIMEOUT_MS: f64 = 20_000.0;
/// Grace period after `domcontentloaded` so SPA shells can mount content.
const PAGE_SETTLE: Duration = Duration::from_millis(800);
/// In `auto` mode, retry with the browser below this many visible characters.
const MIN_CONTENT_CHARS: usize = 200;

/// Realistic browser UA so bot detection does not 403 the static fetch (which
/// would trigger an unnecessary slow browser fallback).
const USER_AGENT: &str = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

const REDIRECT_STATUSES: [u16; 5] = [301, 302, 303, 307, 308];

/// What the frontend receives: the markdown body and the page title.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct ExtractedArticle {
    /// Page title, or `null` when the extractor found none.
    pub title: Option<String>,
    /// Article body as markdown.
    pub content: String,
}

impl ExtractedArticle {
    fn is_confident(&self) -> bool {
        self.content.chars().count() >= MIN_CONTENT_CHARS
    }
}

/// A failure with the same vocabulary the scraper service used. The code is
/// only internal: the command surfaces the message.
#[derive(Debug, Clone)]
struct ScrapeError {
    code: &'static str,
    message: String,
}

impl ScrapeError {
    fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }

    fn invalid_url(message: impl Into<String>) -> Self {
        Self::new("INVALID_URL", message)
    }

    fn private(host: &str) -> Self {
        Self::new(
            "PRIVATE_URL",
            format!("Refusing to fetch private/loopback host \"{host}\" (SSRF protection)"),
        )
    }

    fn dns(host: &str) -> Self {
        Self::new("DNS_NOT_FOUND", format!("Host \"{host}\" could not be resolved"))
    }

    fn fetch_status(message: impl Into<String>) -> Self {
        Self::new("FETCH_STATUS", message)
    }

    fn fetch_timeout(url: &Url) -> Self {
        Self::new(
            "FETCH_TIMEOUT",
            format!(
                "Fetch timed out after {}ms: {url}",
                FETCH_TIMEOUT.as_millis()
            ),
        )
    }

    fn browser_timeout(message: impl Into<String>) -> Self {
        Self::new("BROWSER_TIMEOUT", message)
    }

    fn browser_error(message: impl Into<String>) -> Self {
        Self::new("BROWSER_ERROR", message)
    }

    fn extraction_empty(url: &Url) -> Self {
        Self::new("EXTRACTION_EMPTY", format!("No main content extracted from {url}"))
    }

    /// A rejected URL or a dead DNS name must not be retried in the browser:
    /// the same guard would reject it again.
    fn allows_browser_fallback(&self) -> bool {
        !matches!(self.code, "INVALID_URL" | "PRIVATE_URL" | "DNS_NOT_FOUND")
    }
}

/// Parses and validates a client-supplied URL: absolute, http(s) only, no
/// embedded credentials.
fn require_public_url(raw: &str) -> Result<Url, ScrapeError> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(ScrapeError::invalid_url("url is required"));
    }

    let parsed = Url::parse(trimmed)
        .map_err(|_| ScrapeError::invalid_url("url is not a valid absolute URL"))?;

    match parsed.scheme() {
        "http" | "https" => {}
        other => {
            return Err(ScrapeError::invalid_url(format!(
                "Unsupported URL scheme \"{other}\""
            )))
        }
    }

    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err(ScrapeError::invalid_url(
            "URLs with embedded credentials are not allowed",
        ));
    }

    Ok(parsed)
}

/// SSRF guard: refuses any host that is (or resolves to) a private, loopback
/// or link-local address. Fail closed: unparseable/unresolvable counts as
/// rejected, and one bad address in the DNS answer is enough.
fn assert_public_host(host: &str, port: u16) -> Result<(), ScrapeError> {
    // `Url::host_str` keeps the brackets of an IPv6 literal.
    let literal = host
        .strip_prefix('[')
        .and_then(|value| value.strip_suffix(']'))
        .unwrap_or(host);

    if let Ok(ip) = literal.parse::<IpAddr>() {
        return if is_private_ip(ip) {
            Err(ScrapeError::private(host))
        } else {
            Ok(())
        };
    }

    let addresses = (host, port)
        .to_socket_addrs()
        .map_err(|_| ScrapeError::dns(host))?
        .collect::<Vec<_>>();

    if addresses.is_empty() {
        return Err(ScrapeError::dns(host));
    }

    if addresses.iter().any(|address| is_private_ip(address.ip())) {
        return Err(ScrapeError::private(host));
    }

    Ok(())
}

fn is_private_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => is_private_ipv4(v4),
        IpAddr::V6(v6) => is_private_ipv6(v6),
    }
}

fn is_private_ipv4(ip: Ipv4Addr) -> bool {
    let [a, b, ..] = ip.octets();

    a == 0 // 0.0.0.0/8 ("this network")
        || a == 10 // 10.0.0.0/8
        || a == 127 // loopback
        || (a == 100 && (64..=127).contains(&b)) // 100.64.0.0/10 (CGNAT)
        || (a == 169 && b == 254) // 169.254.0.0/16 (link-local, cloud metadata)
        || (a == 172 && (16..=31).contains(&b)) // 172.16.0.0/12
        || (a == 192 && b == 168) // 192.168.0.0/16
}

fn is_private_ipv6(ip: Ipv6Addr) -> bool {
    // IPv4-mapped addresses (::ffff:192.168.0.1) inherit the IPv4 rules.
    if let Some(v4) = ip.to_ipv4_mapped() {
        return is_private_ipv4(v4);
    }

    if ip.is_unspecified() || ip.is_loopback() {
        return true;
    }

    let first = ip.segments()[0];

    // Unique local fc00::/7 (fc00..fdff) and link-local fe80::/10 (fe80..febf).
    first & 0xfe00 == 0xfc00 || first & 0xffc0 == 0xfe80
}

struct FetchedHtml {
    html: String,
    final_url: Url,
}

fn http_client() -> Result<reqwest::blocking::Client, ScrapeError> {
    reqwest::blocking::Client::builder()
        // Redirects are followed by hand so the SSRF guard vets every hop.
        .redirect(reqwest::redirect::Policy::none())
        .timeout(FETCH_TIMEOUT)
        .user_agent(USER_AGENT)
        .build()
        .map_err(|error| ScrapeError::fetch_status(format!("Could not build HTTP client: {error}")))
}

fn fetch_html(client: &reqwest::blocking::Client, url: &Url) -> Result<FetchedHtml, ScrapeError> {
    let mut current = url.clone();

    for _hop in 0..=MAX_REDIRECTS {
        let host = current.host_str().unwrap_or_default();
        assert_public_host(host, current.port_or_known_default().unwrap_or(443))?;

        let response = client
            .get(current.as_str())
            .header(
                "accept",
                "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
            )
            .header("accept-language", "en-US,en;q=0.9")
            .send()
            .map_err(|error| {
                if error.is_timeout() {
                    ScrapeError::fetch_timeout(&current)
                } else {
                    ScrapeError::fetch_status(format!("Failed to fetch {current}: {error}"))
                }
            })?;

        let status = response.status().as_u16();

        if REDIRECT_STATUSES.contains(&status) {
            let location = response
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|value| value.to_str().ok())
                .ok_or_else(|| {
                    ScrapeError::fetch_status(format!("Redirect without location at {current}"))
                })?;
            current = current.join(location).map_err(|_| {
                ScrapeError::fetch_status(format!("Invalid redirect target from {current}"))
            })?;
            continue;
        }

        if !(200..300).contains(&status) {
            return Err(ScrapeError::fetch_status(format!(
                "Fetch returned HTTP {status} for {current}"
            )));
        }

        let html = response.text().map_err(|error| {
            ScrapeError::fetch_status(format!("Failed to read the body of {current}: {error}"))
        })?;

        return Ok(FetchedHtml {
            html,
            final_url: current,
        });
    }

    Err(ScrapeError::fetch_status(format!(
        "Too many redirects (> {MAX_REDIRECTS})"
    )))
}

/// Vets the page the browser actually landed on. Chromium follows HTTP and JS
/// redirects on its own, so the check on the original URL says nothing about
/// where the page ended up. Fail closed: an URL the final host cannot be read
/// from (`about:blank`) is refused too.
fn assert_public_landing(url: &Url) -> Result<(), ScrapeError> {
    assert_public_host(
        url.host_str().unwrap_or_default(),
        url.port_or_known_default().unwrap_or(443),
    )
}

/// Renders the page in the shared Chromium and dumps its HTML. The article
/// extractor runs afterwards in Rust, so nothing is extracted in-page.
fn fetch_rendered_html(
    state: &BrowserState,
    url: &Url,
) -> Result<FetchedHtml, ScrapeError> {
    let host = url.host_str().unwrap_or_default();
    assert_public_host(host, url.port_or_known_default().unwrap_or(443))?;

    let browser = state.browser().map_err(ScrapeError::browser_error)?;
    let page = open_page(&browser).map_err(ScrapeError::browser_error)?;

    let result = (|| -> Result<FetchedHtml, ScrapeError> {
        navigate(
            &page,
            url.as_str(),
            GotoOptions::default()
                .wait_until("domcontentloaded")
                .timeout(BROWSER_TIMEOUT_MS),
        )
        .map_err(|error| {
            if error.timed_out {
                ScrapeError::browser_timeout(format!(
                    "Navigation timed out after {}ms: {url}",
                    BROWSER_TIMEOUT_MS as u64
                ))
            } else {
                ScrapeError::browser_error(error.message)
            }
        })?;

        std::thread::sleep(PAGE_SETTLE);

        // The landing page is only now known: redirects happen inside
        // Chromium. The request itself has already been issued, but vetting
        // here keeps a private page's content from being extracted and
        // returned to the caller.
        let final_url = Url::parse(&page.url()).map_err(|_| {
            ScrapeError::browser_error(format!("Could not read the final URL of {url}"))
        })?;
        assert_public_landing(&final_url)?;

        let html = page
            .evaluate(
                "(() => document.documentElement.outerHTML)()",
                None,
                ActionOptions::default(),
            )
            .map_err(|error| {
                ScrapeError::browser_error(format!("Could not read the rendered page: {error}"))
            })?
            .as_str()
            .map(str::to_string)
            .ok_or_else(|| {
                ScrapeError::browser_error("Could not read the rendered page: empty document")
            })?;

        Ok(FetchedHtml { html, final_url })
    })();

    let _ = page.close(Default::default());
    result
}

/// Runs Readability on the HTML and returns markdown. Returns `None` when the
/// engine produced nothing usable (SPA skeletons, empty pages).
///
/// `readabilityrs` keeps `<pre>` blocks that other ports drop on modern docs
/// platforms, and its markdown output is CommonMark without raw HTML.
fn extract_html(html: &str, url: &Url) -> Option<ExtractedArticle> {
    let options = readabilityrs::ReadabilityOptions::builder()
        .output_markdown(true)
        .build();
    let article = readabilityrs::Readability::new(html, Some(url.as_str()), Some(options))
        .ok()?
        .parse()?;

    let content = article.markdown_content?.trim().to_string();
    if content.is_empty() {
        return None;
    }

    let title = article.title.unwrap_or_default().trim().to_string();

    Some(ExtractedArticle {
        title: if title.is_empty() { None } else { Some(title) },
        content,
    })
}

/// `render: auto`, the only mode notian uses: static first, browser when the
/// fetch fails (for retryable reasons) or the extraction is too short.
fn resolve_article(state: &BrowserState, url: &Url) -> Result<ExtractedArticle, ScrapeError> {
    let client = http_client()?;
    let static_fetch = fetch_html(&client, url);

    match &static_fetch {
        Ok(fetched) => {
            if let Some(article) = extract_html(&fetched.html, &fetched.final_url) {
                if article.is_confident() {
                    return Ok(article);
                }
            }
        }
        Err(error) => {
            if !error.allows_browser_fallback() {
                return Err(error.clone());
            }
        }
    }

    let fetched = fetch_rendered_html(state, url)?;
    let article = extract_html(&fetched.html, &fetched.final_url)
        .ok_or_else(|| ScrapeError::extraction_empty(&fetched.final_url))?;

    if article.is_confident() {
        Ok(article)
    } else {
        Err(ScrapeError::extraction_empty(&fetched.final_url))
    }
}

/// Extracts the body (markdown) and title of a web page.
#[tauri::command]
pub async fn extract_web_article(
    state: tauri::State<'_, BrowserState>,
    url: String,
) -> Result<ExtractedArticle, String> {
    let state = state.inner().clone();

    // The fetch, the extractor and `rustwright` are all blocking APIs: keep
    // them off the async runtime, like the YouTube commands.
    tauri::async_runtime::spawn_blocking(move || {
        let parsed = require_public_url(&url).map_err(|error| error.message)?;
        resolve_article(&state, &parsed).map_err(|error| error.message)
    })
    .await
    .map_err(|error| format!("Article extraction task failed: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn private(address: &str) -> bool {
        is_private_ip(address.parse().expect("test address"))
    }

    #[test]
    fn private_ipv4_ranges_are_rejected() {
        for address in [
            "0.0.0.0",
            "0.1.2.3",
            "10.0.0.1",
            "10.255.255.255",
            "127.0.0.1",
            "127.255.255.255",
            "100.64.0.1",
            "100.127.255.255",
            "169.254.169.254",
            "172.16.0.1",
            "172.31.255.255",
            "192.168.0.1",
        ] {
            assert!(private(address), "{address} should be private");
        }
    }

    #[test]
    fn public_ipv4_ranges_are_allowed() {
        for address in [
            "1.1.1.1",
            "8.8.8.8",
            "100.63.255.255",
            "100.128.0.0",
            "172.15.255.255",
            "172.32.0.0",
            "192.169.0.1",
            "169.253.0.1",
        ] {
            assert!(!private(address), "{address} should be public");
        }
    }

    #[test]
    fn private_ipv6_ranges_are_rejected() {
        for address in ["::", "::1", "fc00::1", "fd12:3456::1", "fe80::1", "febf::1"] {
            assert!(private(address), "{address} should be private");
        }
    }

    #[test]
    fn public_ipv6_ranges_are_allowed() {
        for address in ["2001:4860:4860::8888", "2a00:1450:4001::200e", "fec0::1"] {
            assert!(!private(address), "{address} should be public");
        }
    }

    #[test]
    fn ipv4_mapped_ipv6_inherits_the_ipv4_rules() {
        assert!(private("::ffff:192.168.0.1"));
        assert!(private("::ffff:127.0.0.1"));
        assert!(!private("::ffff:8.8.8.8"));
    }

    #[test]
    fn require_public_url_accepts_http_and_https() {
        assert_eq!(
            require_public_url(" https://example.com/post ")
                .expect("valid url")
                .as_str(),
            "https://example.com/post"
        );
        assert!(require_public_url("http://example.com").is_ok());
    }

    #[test]
    fn require_public_url_rejects_unsupported_input() {
        assert!(require_public_url("").is_err());
        assert!(require_public_url("not a url").is_err());
        assert!(require_public_url("/relative/path").is_err());
        assert!(require_public_url("file:///etc/passwd").is_err());
        assert!(require_public_url("ftp://example.com").is_err());
        assert!(require_public_url("https://user:pass@example.com").is_err());
    }

    #[test]
    fn only_retryable_failures_fall_back_to_the_browser() {
        assert!(!ScrapeError::private("localhost").allows_browser_fallback());
        assert!(!ScrapeError::dns("example.invalid").allows_browser_fallback());
        assert!(!ScrapeError::invalid_url("bad").allows_browser_fallback());
        assert!(ScrapeError::fetch_status("boom").allows_browser_fallback());
        assert!(ScrapeError::fetch_timeout(&Url::parse("https://example.com").unwrap())
            .allows_browser_fallback());
    }

    #[test]
    fn browser_landing_on_a_private_host_is_refused() {
        for raw in [
            "http://127.0.0.1:8080/admin",
            "http://192.168.1.5/router",
            "http://169.254.169.254/latest/meta-data/",
            "http://[::1]:9222/",
        ] {
            let url = Url::parse(raw).expect("url");
            assert!(
                matches!(assert_public_landing(&url), Err(error) if error.code == "PRIVATE_URL"),
                "{raw} should be refused as private"
            );
        }

        // Public host as an IP literal: a hostname would need a live DNS
        // lookup (`assert_public_host` resolves), and the suite stays offline.
        let url = Url::parse("https://1.1.1.1/post").expect("url");
        assert!(assert_public_landing(&url).is_ok());
    }

    #[test]
    fn browser_landing_without_a_host_fails_closed() {
        let url = Url::parse("about:blank").expect("url");
        assert!(assert_public_landing(&url).is_err());
    }

    #[test]
    fn extracts_title_and_markdown_from_html() {
        let html = r#"<html><head><title>Example Post</title></head><body>
            <nav>Menu</nav>
            <article>
                <h1>Example Post</h1>
                <p>First paragraph of the article body, long enough to be kept by the extractor.</p>
                <p>Second paragraph continues the article with more content.</p>
            </article>
            <footer>Footer</footer>
        </body></html>"#;
        let url = Url::parse("https://example.com/post").unwrap();

        let article = extract_html(html, &url).expect("extraction");

        assert_eq!(article.title.as_deref(), Some("Example Post"));
        assert!(article.content.contains("First paragraph"));
        assert!(!article.content.contains("<p>"), "expected markdown, got HTML");
    }

    // Live checks. Ignored because they need network; run by hand with
    //   cargo test --manifest-path src-tauri/Cargo.toml --lib live_ -- --ignored
    #[test]
    #[ignore = "needs network access"]
    fn live_extracts_a_real_article() {
        let state = BrowserState::default();
        let url = require_public_url("https://en.wikipedia.org/wiki/Rust_(programming_language)")
            .expect("url");

        let article = resolve_article(&state, &url).expect("extraction");

        assert!(article.content.len() > MIN_CONTENT_CHARS);
        assert!(article.title.as_deref().unwrap_or_default().contains("Rust"));
    }

    // A/B harness against the Node scraper service: writes one markdown file
    // per URL so the two engines can be diffed.
    //
    //   printf '%s\n' URL1 URL2 > /tmp/opencode/ab-urls.txt
    //   cargo test --manifest-path src-tauri/Cargo.toml --lib ab_export -- --ignored --nocapture
    #[test]
    #[ignore = "manual A/B harness (reads /tmp/opencode/ab-urls.txt)"]
    fn ab_export_extractions() {
        let list = match std::fs::read_to_string("/tmp/opencode/ab-urls.txt") {
            Ok(list) => list,
            Err(error) => {
                println!("skipping A/B: {error}");
                return;
            }
        };

        let out_dir = std::path::Path::new("/tmp/opencode/ab-rust");
        std::fs::create_dir_all(out_dir).expect("create output dir");
        let state = BrowserState::default();

        for (index, line) in list
            .lines()
            .map(str::trim)
            .filter(|line| !line.is_empty() && !line.starts_with('#'))
            .enumerate()
        {
            match require_public_url(line).and_then(|url| resolve_article(&state, &url)) {
                Ok(article) => {
                    let body = format!(
                        "# {}\n\n{}",
                        article.title.unwrap_or_default(),
                        article.content
                    );
                    std::fs::write(out_dir.join(format!("{index:02}.md")), body)
                        .expect("write extraction");
                    println!("[{index}] ok {line}");
                }
                Err(error) => println!("[{index}] FAIL {line}: {}", error.message),
            }
        }

        state.close_browser();
    }
}
