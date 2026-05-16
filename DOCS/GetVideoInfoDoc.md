# `get_youtube_info` — Guide

Tauri command defined in `src-tauri/src/youtube_info.rs`.  
Navigates to a YouTube URL using the shared browser instance, expands the video description, extracts chapter details, and evaluates CSS-selector queries — all with configurable retry polling.

---

## Rust Signature

```rust
#[tauri::command]
pub async fn get_youtube_info(
    app: AppHandle,
    url: String,
    selectors: Vec<YoutubeInfoSelector>,
    interval_time: u64,   // ms between polling retries
    max_attempts: u32,    // max retry attempts per selector
) -> Result<(Vec<YoutubeInfoResult>, Vec<YoutubeDetail>), String>
```

### Types

```rust
// Input
pub struct YoutubeInfoSelector {
    pub name: String,
    pub selector: String,  // CSS selector
}

// Output — selector results
pub struct YoutubeInfoResult {
    pub name: String,
    pub selector: String,
    pub text_content: Option<String>,  // serialised as "textContent"
}

// Output — chapter entries from div#details
pub struct YoutubeDetail {
    pub title: Option<String>,
    pub time: Option<String>,
}
```

---

## Frontend Invocation

```ts
import { invoke } from '@tauri-apps/api/core';

const [videoMeta, chapters] = await invoke<[VideoMetaItem[], Chapter[]]>('get_youtube_info', {
	url: 'https://www.youtube.com/watch?v=VIDEO_ID',
	selectors: [
		{ name: 'title', selector: '#title h1 yt-formatted-string' },
		{ name: 'channel', selector: '#channel-name a' },
		{ name: 'views', selector: 'span.view-count' },
		{ name: 'uploadDate', selector: 'div#info-strings yt-formatted-string' }
	],
	intervalTime: 5, // ms between retries
	maxAttempts: 200
});
```

> **Note:** the Rust fields `interval_time` / `max_attempts` are camelCase on the JS side (`intervalTime` / `maxAttempts`) because Tauri's invoke handler automatically converts them.

---

## Attribute Retrieval Flow

1. **Navigate** — `page.goto(url)` + `wait_for_navigation()`.
2. **Expand description** — polls `tp-yt-paper-button#expand` up to `max_attempts` times (waiting `interval_time` ms between each) and clicks it. Returns `Err` if never found.
3. **Extract chapters** — evaluates a JS snippet that queries all `div#details` elements, pulling `h4.textContent` (title) and `div#time.textContent` (timestamp). Duplicates are removed while preserving order.
4. **Extract selectors** — for each `YoutubeInfoSelector`, runs:
   ```js
   const el = document.querySelector('<selector>');
   return el ? (el.textContent || '').trim() || null : null;
   ```
   Retries up to `max_attempts` times until a non-empty string is returned.  
   Result is `None` if still empty after all attempts.

---

## Tauri Events

| Event         | Payload `key`    | When                                                                                                  |
| ------------- | ---------------- | ----------------------------------------------------------------------------------------------------- |
| `flow-status` | `"youtube-info"` | Start (status: `"Extracting selectors"`) and end (status: `"done"`, data includes both result arrays) |

Listen on the frontend:

```ts
import { listen } from '@tauri-apps/api/event';

await listen('flow-status', (event) => {
	const { key, status, data } = event.payload as {
		key: string;
		status: string;
		data: unknown;
	};
	if (key === 'youtube-info' && status === 'done') {
		console.log(data); // { results, time_texts }
	}
});
```

---

## Registration (`lib.rs`)

```rust
mod youtube_info;
pub use crate::youtube_info::get_youtube_info;

// inside invoke_handler:
tauri::generate_handler![
    // ...
    get_youtube_info,
    // ...
]
```
