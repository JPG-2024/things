//! Tiny loopback HTTP server that serves the YouTube player wrapper page.
//!
//! Tauri production builds run the webview on the `tauri://localhost`
//! protocol, and YouTube's embedded player refuses to play from a non-HTTP
//! origin (tauri-apps/tauri#14422, "Error 153: Video player configuration
//! error"). This server exists solely to give the player iframe a valid
//! `http://127.0.0.1:<port>` origin: the app frames
//! `http://127.0.0.1:<port>/embed?v=<video id>`, the wrapper page frames the
//! real YouTube embed, and a small relay script passes `postMessage` traffic
//! in both directions so the floating player's volume API keeps working
//! unchanged.
//!
//! Scope is deliberately minimal: single route, loopback bind only, and the
//! video id is regex-validated before it is ever interpolated into the page.

use std::net::SocketAddr;
use std::sync::OnceLock;

use axum::extract::Query;
use axum::http::StatusCode;
use axum::response::{Html, IntoResponse, Response};
use axum::routing::get;
use axum::Router;
use once_cell::sync::Lazy;
use regex::Regex;
use serde::Deserialize;

/// Port the wrapper server listens on; set once in [`start_embed_server`].
static EMBED_PORT: OnceLock<u16> = OnceLock::new();

/// YouTube video ids are exactly eleven characters of `[A-Za-z0-9_-]`.
/// Validating before interpolation is what keeps the wrapper page
/// injection-free; everything else gets rejected before any HTML is built.
static VIDEO_ID: Lazy<Regex> = Lazy::new(|| Regex::new(r"^[A-Za-z0-9_-]{11}$").expect("valid video id regex"));

#[derive(Deserialize)]
pub struct EmbedQuery {
	v: Option<String>,
}

/// Wrapper page served on every `GET /embed?v=<id>`. The inner iframe URL and
/// the relay script replicate the single-iframe embed the floating player
/// used before the wrapper existed.
const EMBED_PAGE: &str = r#"<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>YouTube video player</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; overflow: hidden; background: #000; }
  iframe { width: 100%; height: 100%; border: none; }
</style>
</head>
<body>
<iframe
  id="yt"
  src="{IFRAME_SRC}"
  allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share"
  allowfullscreen
></iframe>
<script>
(function () {
  var inner = document.getElementById('yt');
  window.addEventListener('message', function (e) {
    if (inner.contentWindow === null) return;
    // Down: a command posted by the app's parent window -> the player.
    if (e.source === window.top) {
      inner.contentWindow.postMessage(e.data, '*');
    }
    // Up: an event fired by the player -> the app's parent window.
    if (e.source === inner.contentWindow) {
      window.top.postMessage(e.data, '*');
    }
  });
})();
</script>
</body>
</html>"#;

/// Inner iframe URL for one video. `origin` is the wrapper's own origin, so
/// YouTube's iframe API posts its events back to the wrapper, which relays
/// them up to the app.
fn player_url(video_id: &str, port: u16) -> String {
	format!(
		"https://www.youtube-nocookie.com/embed/{video_id}?autoplay=1&rel=0&modestbranding=1&enablejsapi=1&origin=http://127.0.0.1:{port}"
	)
}

fn embed_html(video_id: &str, port: u16) -> String {
	EMBED_PAGE.replace("{IFRAME_SRC}", &player_url(video_id, port))
}

async fn embed_handler(Query(query): Query<EmbedQuery>) -> Response {
	embed_response(query.v.as_deref())
}

/// Pure handler logic, split from the extractor so tests can call it
/// directly without spinning up the Router.
fn embed_response(video_id: Option<&str>) -> Response {
	let Some(video_id) = video_id else {
		return (StatusCode::BAD_REQUEST, "missing video id").into_response();
	};
	if !VIDEO_ID.is_match(video_id) {
		return (StatusCode::BAD_REQUEST, "invalid youtube video id").into_response();
	}
	let Some(port) = EMBED_PORT.get().copied() else {
		return (StatusCode::SERVICE_UNAVAILABLE, "embed server not ready").into_response();
	};
	Html(embed_html(video_id, port)).into_response()
}

/// Starts the wrapper server on a freshly picked unused port, bound to
/// loopback only. Runs in dev and prod alike so the wrapper/relay path is
/// always the one being exercised. The bind is awaited here (it completes in
/// microseconds) so the port is guaranteed serving before the first video is
/// opened.
pub fn start_embed_server() -> Result<String, String> {
	let port = portpicker::pick_unused_port().ok_or("no free port available")?;
	let addr = SocketAddr::from(([127, 0, 0, 1], port));
	let listener = tauri::async_runtime::block_on(tokio::net::TcpListener::bind(addr))
		.map_err(|error| format!("failed to bind embed server on {addr}: {error}"))?;

	EMBED_PORT.set(port).map_err(|_| "embed server already started")?;

	tauri::async_runtime::spawn(async move {
		let app = Router::new().route("/embed", get(embed_handler));
		if let Err(error) = axum::serve(listener, app).await {
			eprintln!("embed server terminated: {error}");
		}
	});

	Ok(format!("http://127.0.0.1:{port}"))
}

/// Resolves the wrapper URL the floating player should frame for one video.
/// Called by the frontend on every player mount/video change.
#[tauri::command]
pub fn youtube_embed_url(video_id: String) -> Result<String, String> {
	if !VIDEO_ID.is_match(&video_id) {
		return Err(format!("invalid youtube video id: {video_id}"));
	}
	let port = EMBED_PORT.get().copied().ok_or("embed server not running")?;
	Ok(format!("http://127.0.0.1:{port}/embed?v={video_id}"))
}

#[cfg(test)]
mod tests {
	use super::*;

	/// Sentinel port for handler-level tests. `EMBED_PORT` is a process-wide
	/// `OnceLock`, so whatever test touches it first wins; every response
	/// test calls this and asserts against the same value.
	fn ensure_test_port() -> u16 {
		*EMBED_PORT.get_or_init(|| 57_531)
	}

	#[test]
	fn accepts_standard_video_ids() {
		assert!(VIDEO_ID.is_match("dQw4w9WgXcQ"));
		assert!(VIDEO_ID.is_match("_A-bC12xYz1"));
	}

	#[test]
	fn rejects_ids_that_are_not_exactly_eleven_chars() {
		assert!(!VIDEO_ID.is_match(""));
		assert!(!VIDEO_ID.is_match("dQw4w9WgXc"));
		assert!(!VIDEO_ID.is_match("dQw4w9WgXcQQ"));
	}

	#[test]
	fn rejects_ids_with_special_or_injection_characters() {
		assert!(!VIDEO_ID.is_match("\" onload=alert(1)"));
		assert!(!VIDEO_ID.is_match("<script>x</scri"));
		assert!(!VIDEO_ID.is_match("../etc/passwd"));
	}

	#[test]
	fn embed_html_embeds_the_player_and_wrapper_origin() {
		let html = embed_html("dQw4w9WgXcQ", 57531);
		assert!(html.contains("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?"));
		assert!(html.contains("origin=http://127.0.0.1:57531"));
		assert!(html.contains("allowfullscreen"));
		assert!(!html.contains("{IFRAME_SRC}"));
	}

	#[tokio::test]
	async fn valid_video_id_serves_the_wrapper_page() {
		let port = ensure_test_port();
		let response = embed_response(Some("dQw4w9WgXcQ"));
		assert_eq!(response.status(), StatusCode::OK);
		let fragment = axum::body::to_bytes(response.into_body(), usize::try_from(u32::MAX).expect("body limit"))
			.await
			.expect("body");
		let body = String::from_utf8(fragment.to_vec()).expect("utf8 body");
		assert!(body.contains("<iframe"));
		assert!(body.contains(&format!("origin=http://127.0.0.1:{port}")));
	}

	#[test]
	fn missing_and_invalid_video_ids_are_rejected() {
		ensure_test_port();
		let missing = embed_response(None);
		assert_eq!(missing.status(), StatusCode::BAD_REQUEST);
		let invalid = embed_response(Some("../etc/passwd"));
		assert_eq!(invalid.status(), StatusCode::BAD_REQUEST);
	}

	/// End-to-end check of the actual Router wiring: valid id -> 200 wrapper,
	/// invalid id -> 400, unknown path -> 404. Origin correctness lives in
	/// `embed_html_embeds_the_player_and_wrapper_origin`; this one only cares
	/// about the HTTP surface.
	#[tokio::test]
	async fn router_serves_embed_rejects_the_rest() {
		let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.expect("bind");
		let addr = listener.local_addr().expect("local addr");
		ensure_test_port();

		let app = Router::new().route("/embed", get(embed_handler));
		tokio::spawn(async move {
			axum::serve(listener, app).await.expect("serve");
		});

		let client = reqwest::Client::new();

		let ok = client
			.get(format!("http://{addr}/embed?v=dQw4w9WgXcQ"))
			.send()
			.await
			.expect("request");
		assert_eq!(ok.status(), reqwest::StatusCode::OK);
		assert!(ok.text().await.expect("body").contains("<iframe"));

		let bad = client
			.get(format!("http://{addr}/embed?v=not_a_video_id"))
			.send()
			.await
			.expect("request");
		assert_eq!(bad.status(), reqwest::StatusCode::BAD_REQUEST);

		let unknown = client.get(format!("http://{addr}/")).send().await.expect("request");
		assert_eq!(unknown.status(), reqwest::StatusCode::NOT_FOUND);
	}
}
