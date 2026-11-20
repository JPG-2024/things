//! YouTube scraping through an in-process Chromium (`rustwright`).
//!
//! Port of the external scraper service's YouTube routes: a channel page
//! (video list, avatar and header text) and the owner of a video. They used to
//! be HTTP calls (`/api/profile`, `/api/video`, `/api/scrape`) to a separate
//! Node process; now they are Tauri commands, so the desktop app needs no
//! sidecar and no port.
//!
//! One Chromium is launched lazily and kept for the process lifetime — the
//! local engine is expensive to start and single-page-per-request is enough
//! isolation for our use. Every command runs the synchronous `rustwright` API
//! on a blocking thread so a long scroll never stalls the async runtime.

use std::collections::HashSet;
use std::time::{Duration, Instant};

use rustwright::{ActionOptions, GotoOptions, Page};
use serde::{Deserialize, Serialize};

use crate::browser::{navigate, open_page, BrowserState};

const DOMAIN: &str = "youtube.com";

/// Unique videos requested when the caller does not pass a limit.
const DEFAULT_LIMIT: u32 = 450;
/// Hard ceiling: above this the scrape would cost minutes of scrolling.
const MAX_LIMIT: u32 = 1500;
/// YouTube appends roughly this many videos per continuation page.
const ITEMS_PER_BATCH: u32 = 30;
/// Scroll rounds on top of the derived budget, to absorb short batches.
const EXTRA_ROUNDS: u32 = 2;
/// Wait per scroll round before recounting unique videos.
const SCROLL_DELAY: Duration = Duration::from_millis(1500);
/// Consecutive quiet rounds before concluding the channel ended.
const STABLE_ROUNDS: u32 = 2;
/// Selector budget for the main content shell and the owner anchor.
const SELECTOR_TIMEOUT: Duration = Duration::from_secs(15);
/// The channel header renders later than the shell and may not exist at all.
const HEADER_TIMEOUT: Duration = Duration::from_secs(5);
/// Polling interval of the selector wait.
const POLL_INTERVAL: Duration = Duration::from_millis(150);

/// One video listed on a channel page.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct ScrapedVideo {
    pub url: String,
    pub title: String,
}

/// How the scroll ended, for diagnostics and for the caller's UI copy.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct ScrollInfo {
    pub limit: u32,
    pub rounds: u32,
    /// `disabled | limit | exhausted | cap`
    pub reason: String,
}

/// A channel page as the scraper returns it.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ScrapedProfile {
    pub id: String,
    #[serde(rename = "profilePath")]
    pub profile_path: String,
    pub videos: Vec<ScrapedVideo>,
    #[serde(rename = "profileImage")]
    pub profile_image: Option<String>,
    #[serde(rename = "pageHeaderText")]
    pub page_header_text: Vec<String>,
    pub scroll: ScrollInfo,
}

/// Owner of a video: the channel handle without the leading `@`.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct VideoOwner {
    pub id: String,
    pub profile: String,
}

#[derive(Clone, Debug, PartialEq)]
struct ProfilePath {
    /// `@`, `channel/`, `c/` or `user/`.
    prefix: String,
    id: String,
}

/// Waits for `selector` by polling the DOM. `rustwright` has no
/// `waitForSelector`, and a Rust-side loop keeps the timeout semantics of the
/// original service (a fixed budget, polled every [`POLL_INTERVAL`]).
fn wait_for_selector(page: &Page, selector: &str, timeout: Duration) -> Result<(), String> {
    let probe = format!(
        "(() => document.querySelector({}) !== null)()",
        serde_json::to_string(selector).map_err(|error| error.to_string())?
    );
    let deadline = Instant::now() + timeout;

    loop {
        let found = page
            .evaluate(&probe, None, ActionOptions::default())
            .map_err(|error| format!("Selector probe for \"{selector}\" failed: {error}"))?;

        if found.as_bool().unwrap_or(false) {
            return Ok(());
        }

        if Instant::now() >= deadline {
            return Err(format!(
                "Timeout {}ms exceeded waiting for \"{selector}\"",
                timeout.as_millis()
            ));
        }

        std::thread::sleep(POLL_INTERVAL);
    }
}

/// Video anchors of the channel page. Embedded verbatim from the scraper
/// service: the title lives either on the anchor itself or in a nested span
/// depending on which renderer YouTube served.
const COLLECT_VIDEOS_JS: &str = r##"(() => Array.from(document.querySelectorAll("#content a[href*='/watch?v=']")).map((a) => {
    const titleEl =
        a.id === 'video-title'
            ? a
            : a.matches('.ytLockupMetadataViewModelTitle')
                ? a.querySelector('span') ?? a
                : a.closest('h3')
                    ? a.querySelector('span') ?? a
                    : null;
    return { url: a.href, title: (titleEl?.innerText ?? '').trim() };
}))()"##;

const SCROLL_TO_BOTTOM_JS: &str =
    "(() => { window.scrollTo(0, document.documentElement.scrollHeight); return true; })()";

/// The avatar, not the banner: the banner is optional and shifts image order.
const PROFILE_IMAGE_JS: &str = r##"(() => {
    const header = document.querySelector('#page-header');
    if (!header) return null;
    const selectors = [
        'yt-avatar-shape img',
        'yt-decorated-avatar-view-model img',
        '#avatar img',
        'ytd-c4-tabbed-header-renderer #avatar img',
    ];
    for (const selector of selectors) {
        const img = header.querySelector(selector);
        if (img?.src) return img.src;
    }
    const fallback = [...header.querySelectorAll('img')].find(
        (img) =>
            img.src.startsWith('https://yt3.googleusercontent.com') &&
            !img.closest('yt-image-banner-view-model, .ytImageBannerViewModelHost')
    );
    return fallback?.src ?? null;
})()"##;

const HEADER_TEXT_JS: &str = r##"(() => {
    const el = document.querySelector('#page-header');
    if (!el) return [];
    return el.innerText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
})()"##;

/// First `@handle` linked from the watch page, which is the video owner.
const VIDEO_OWNER_JS: &str = r##"(() => {
    const handles = Array.from(document.querySelectorAll('a'))
        .map((a) => (a.href.match(/\/@([^/?#&]+)/) ?? [])[1])
        .filter(Boolean);
    const unique = [...new Set(handles)];
    return unique.length ? `@${unique[0]}` : null;
})()"##;

fn collect_videos(page: &Page) -> Result<Vec<ScrapedVideo>, String> {
    let value = page
        .evaluate(COLLECT_VIDEOS_JS, None, ActionOptions::default())
        .map_err(|error| format!("Video collection failed: {error}"))?;

    serde_json::from_value(value)
        .map_err(|error| format!("Unexpected video list shape: {error}"))
}

fn page_header_text(page: &Page) -> Result<Vec<String>, String> {
    let value = page
        .evaluate(HEADER_TEXT_JS, None, ActionOptions::default())
        .map_err(|error| format!("Header read failed: {error}"))?;

    serde_json::from_value(value).map_err(|error| format!("Unexpected header shape: {error}"))
}

fn profile_image(page: &Page) -> Result<Option<String>, String> {
    let value = page
        .evaluate(PROFILE_IMAGE_JS, None, ActionOptions::default())
        .map_err(|error| format!("Profile image read failed: {error}"))?;

    Ok(value.as_str().map(str::to_string))
}

fn unique_count(videos: &[ScrapedVideo]) -> u32 {
    videos
        .iter()
        .map(|video| video.url.as_str())
        .collect::<HashSet<_>>()
        .len() as u32
}

/// Scroll budget derived from the requested limit instead of a fixed count:
/// height is a poor progress signal because it can stay put while the DOM
/// changes, so rounds are counted in unique videos.
fn max_rounds(limit: u32) -> u32 {
    limit.div_ceil(ITEMS_PER_BATCH) + EXTRA_ROUNDS
}

fn scroll_reason(unique: u32, limit: u32, stable: u32) -> &'static str {
    if unique >= limit {
        "limit"
    } else if stable >= STABLE_ROUNDS {
        "exhausted"
    } else {
        "cap"
    }
}

fn scroll_profile(
    page: &Page,
    videos: &mut Vec<ScrapedVideo>,
    limit: u32,
) -> Result<ScrollInfo, String> {
    let round_budget = max_rounds(limit);
    let mut rounds = 0;
    let mut stable = 0;
    let mut unique = unique_count(videos);

    while rounds < round_budget && unique < limit {
        page.evaluate(SCROLL_TO_BOTTOM_JS, None, ActionOptions::default())
            .map_err(|error| format!("Scroll failed: {error}"))?;
        std::thread::sleep(SCROLL_DELAY);

        videos.extend(collect_videos(page)?);
        rounds += 1;

        let next = unique_count(videos);
        stable = if next == unique { stable + 1 } else { 0 };
        unique = next;

        if stable >= STABLE_ROUNDS {
            break;
        }
    }

    Ok(ScrollInfo {
        limit,
        rounds,
        reason: scroll_reason(unique, limit, stable).to_string(),
    })
}

/// First occurrence wins; a later duplicate contributes its title only when the
/// first copy had none (YouTube sometimes ships the anchor before the label).
fn dedupe(videos: Vec<ScrapedVideo>) -> Vec<ScrapedVideo> {
    let mut out: Vec<ScrapedVideo> = Vec::with_capacity(videos.len());

    for video in videos {
        // `position` instead of an `iter_mut().find()` match: the mutable borrow
        // would otherwise outlive the arm that pushes a new entry.
        match out.iter().position(|existing| existing.url == video.url) {
            Some(index) => {
                if out[index].title.is_empty() && !video.title.is_empty() {
                    out[index].title = video.title;
                }
            }
            None => out.push(video),
        }
    }

    out
}

fn parse_profile_path(raw: &str) -> ProfilePath {
    let trimmed = raw.trim();

    if let Some(rest) = trimmed.strip_prefix('@') {
        return ProfilePath {
            prefix: "@".to_string(),
            id: rest.to_string(),
        };
    }

    for prefix in ["channel/", "c/", "user/"] {
        if let Some(rest) = trimmed.strip_prefix(prefix) {
            return ProfilePath {
                prefix: prefix.to_string(),
                id: rest.to_string(),
            };
        }
    }

    ProfilePath {
        prefix: "@".to_string(),
        id: trimmed.to_string(),
    }
}

fn normalize_limit(limit: Option<u32>) -> Result<u32, String> {
    match limit {
        None => Ok(DEFAULT_LIMIT),
        Some(0) => Err(format!(
            "Invalid limit: 0 (expected an integer between 1 and {MAX_LIMIT})"
        )),
        Some(value) if value > MAX_LIMIT => Err(format!(
            "Invalid limit: {value} (expected an integer between 1 and {MAX_LIMIT})"
        )),
        Some(value) => Ok(value),
    }
}

fn scrape_profile_sync(
    state: &BrowserState,
    profile_path: &str,
    scroll: bool,
    limit: u32,
) -> Result<ScrapedProfile, String> {
    let parsed = parse_profile_path(profile_path);
    if parsed.id.is_empty() {
        return Err(format!("Invalid profile path: \"{profile_path}\""));
    }

    let browser = state.browser()?;
    let page = open_page(&browser)?;

    let result = (|| -> Result<ScrapedProfile, String> {
        let url = format!("https://{DOMAIN}/{}{}/videos", parsed.prefix, parsed.id);
        navigate(&page, &url, GotoOptions::default().wait_until("domcontentloaded"))
            .map_err(|error| error.message)?;
        wait_for_selector(&page, "#content", SELECTOR_TIMEOUT)?;

        // Channels without a header exist: the wait is best effort, and the
        // reads below simply come back empty.
        let _ = wait_for_selector(&page, "#page-header", HEADER_TIMEOUT);

        let page_header_text = page_header_text(&page)?;
        let profile_image = profile_image(&page)?;

        let mut videos = collect_videos(&page)?;
        let scroll_info = if scroll {
            scroll_profile(&page, &mut videos, limit)?
        } else {
            ScrollInfo {
                limit,
                rounds: 0,
                reason: "disabled".to_string(),
            }
        };

        Ok(ScrapedProfile {
            id: parsed.id.clone(),
            profile_path: format!("{}{}", parsed.prefix, parsed.id),
            videos: dedupe(videos),
            profile_image,
            page_header_text,
            scroll: scroll_info,
        })
    })();

    let _ = page.close(Default::default());
    result
}

fn video_owner_sync(state: &BrowserState, id: &str) -> Result<VideoOwner, String> {
    let browser = state.browser()?;
    let page = open_page(&browser)?;

    let result = (|| -> Result<VideoOwner, String> {
        let url = format!("https://{DOMAIN}/watch?v={id}");
        navigate(&page, &url, GotoOptions::default().wait_until("domcontentloaded"))
            .map_err(|error| error.message)?;

        // `#content` is a skeleton shell; the owner's @handle anchor renders
        // later, so waiting for it (not for the shell) is what matters.
        wait_for_selector(&page, "a[href*='/@']", SELECTOR_TIMEOUT)?;

        let value = page
            .evaluate(VIDEO_OWNER_JS, None, ActionOptions::default())
            .map_err(|error| format!("Owner read failed: {error}"))?;

        let profile = value
            .as_str()
            .map(str::to_string)
            .ok_or_else(|| format!("Could not resolve the channel of video {id}"))?;

        Ok(VideoOwner {
            id: id.to_string(),
            profile,
        })
    })();

    let _ = page.close(Default::default());
    result
}

/// Scrapes a channel page: videos, avatar and header text.
///
/// `scroll` loads continuations up to `limit` unique videos; without it only
/// the first DOM batch is read (cheap, ~30 videos).
#[tauri::command]
pub async fn scrape_youtube_profile(
    state: tauri::State<'_, BrowserState>,
    profile_path: String,
    scroll: bool,
    limit: Option<u32>,
) -> Result<ScrapedProfile, String> {
    let limit = normalize_limit(limit)?;
    let state = state.inner().clone();

    tauri::async_runtime::spawn_blocking(move || {
        scrape_profile_sync(&state, &profile_path, scroll, limit)
    })
    .await
    .map_err(|error| format!("Scrape task failed: {error}"))?
}

/// Resolves the owner (`@handle`) of a video id.
#[tauri::command]
pub async fn get_youtube_video_owner(
    state: tauri::State<'_, BrowserState>,
    video_id: String,
) -> Result<VideoOwner, String> {
    let state = state.inner().clone();

    tauri::async_runtime::spawn_blocking(move || video_owner_sync(&state, &video_id))
        .await
        .map_err(|error| format!("Video owner task failed: {error}"))?
}

/// Whether a Chromium binary is available to the scrapers, so the UI can tell
/// "not installed" apart from "the page failed".
#[tauri::command]
pub fn youtube_browser_status(state: tauri::State<'_, BrowserState>) -> bool {
    state.inner().is_available()
}

/// Stores the Chromium path the scraper should use (`None`/empty = discover).
#[tauri::command]
pub fn set_youtube_browser_path(
    state: tauri::State<'_, BrowserState>,
    path: Option<String>,
) -> Result<(), String> {
    state.inner().set_executable_path(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn video(url: &str, title: &str) -> ScrapedVideo {
        ScrapedVideo {
            url: url.to_string(),
            title: title.to_string(),
        }
    }

    #[test]
    fn parse_profile_path_keeps_every_supported_prefix() {
        assert_eq!(
            parse_profile_path("@syntaxfm"),
            ProfilePath {
                prefix: "@".to_string(),
                id: "syntaxfm".to_string()
            }
        );
        assert_eq!(
            parse_profile_path("channel/UC123"),
            ProfilePath {
                prefix: "channel/".to_string(),
                id: "UC123".to_string()
            }
        );
        assert_eq!(
            parse_profile_path("c/SomeName"),
            ProfilePath {
                prefix: "c/".to_string(),
                id: "SomeName".to_string()
            }
        );
        assert_eq!(
            parse_profile_path("user/legacy"),
            ProfilePath {
                prefix: "user/".to_string(),
                id: "legacy".to_string()
            }
        );
    }

    #[test]
    fn parse_profile_path_falls_back_to_a_handle_and_trims() {
        assert_eq!(
            parse_profile_path("  bareName  "),
            ProfilePath {
                prefix: "@".to_string(),
                id: "bareName".to_string()
            }
        );
    }

    #[test]
    fn normalize_limit_defaults_and_bounds_the_request() {
        assert_eq!(normalize_limit(None).unwrap(), DEFAULT_LIMIT);
        assert_eq!(normalize_limit(Some(1)).unwrap(), 1);
        assert_eq!(normalize_limit(Some(MAX_LIMIT)).unwrap(), MAX_LIMIT);
        assert!(normalize_limit(Some(0)).is_err());
        assert!(normalize_limit(Some(MAX_LIMIT + 1)).is_err());
    }

    #[test]
    fn max_rounds_is_derived_from_the_limit() {
        assert_eq!(max_rounds(1), 3);
        assert_eq!(max_rounds(30), 3);
        assert_eq!(max_rounds(31), 4);
        assert_eq!(max_rounds(DEFAULT_LIMIT), 17);
        assert_eq!(max_rounds(MAX_LIMIT), 52);
    }

    #[test]
    fn scroll_reason_reports_why_the_scroll_stopped() {
        assert_eq!(scroll_reason(10, 10, 0), "limit");
        assert_eq!(scroll_reason(5, 10, STABLE_ROUNDS), "exhausted");
        assert_eq!(scroll_reason(5, 10, 0), "cap");
    }

    #[test]
    fn dedupe_keeps_the_first_copy_and_fills_a_missing_title() {
        let videos = vec![
            video("https://youtu.be/a", ""),
            video("https://youtu.be/b", "B"),
            video("https://youtu.be/a", "A"),
        ];

        assert_eq!(
            dedupe(videos),
            vec![video("https://youtu.be/a", "A"), video("https://youtu.be/b", "B")]
        );
    }

    #[test]
    fn dedupe_never_overwrites_an_existing_title() {
        let videos = vec![
            video("https://youtu.be/a", "First"),
            video("https://youtu.be/a", "Second"),
        ];

        assert_eq!(dedupe(videos), vec![video("https://youtu.be/a", "First")]);
    }

    #[test]
    fn unique_count_counts_urls_not_entries() {
        let videos = vec![
            video("https://youtu.be/a", "A"),
            video("https://youtu.be/a", "A again"),
            video("https://youtu.be/b", "B"),
        ];

        assert_eq!(unique_count(&videos), 2);
    }

    // Live selectors check. Ignored because it needs Chromium and network; run
    // it by hand after YouTube changes its markup:
    //
    //   cargo test --manifest-path src-tauri/Cargo.toml --lib live_ -- --ignored
    #[test]
    #[ignore = "needs Chromium and network access"]
    fn live_syntaxfm_channel_returns_videos() {
        let state = BrowserState::default();
        let profile =
            scrape_profile_sync(&state, "@syntaxfm", false, 5).expect("channel scrape failed");
        state.close_browser();

        assert_eq!(profile.id, "syntaxfm");
        assert_eq!(profile.profile_path, "@syntaxfm");
        assert!(!profile.videos.is_empty(), "no videos were collected");
        assert!(profile
            .videos
            .iter()
            .all(|video| video.url.contains("watch?v=")));
    }

    #[test]
    #[ignore = "needs Chromium and network access"]
    fn live_video_owner_resolves_a_handle() {
        let state = BrowserState::default();
        let owner = video_owner_sync(&state, "dQw4w9WgXcQ").expect("owner scrape failed");
        state.close_browser();

        assert!(owner.profile.starts_with('@'), "got {:?}", owner.profile);
    }
}
